import { API_URL, REQUEST_TIMEOUT_MS } from '../settings.js';
import { SectorApiError, SectorAuthError } from './types.js';
import type { PanelInfo, PanelListItem, PanelStatus } from './types.js';

interface RequestOptions {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
  auth?: boolean;
}

function parseJwtExp(token: string): number {
  const parts = token.split('.');
  if (parts.length < 2) {
    return Math.floor(Date.now() / 1000) + 60;
  }
  const payload = parts[1] + '='.repeat((4 - parts[1].length % 4) % 4);
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp : Math.floor(Date.now() / 1000) + 60;
  } catch {
    return Math.floor(Date.now() / 1000) + 60;
  }
}

export class SectorApi {
  private token?: string;
  private tokenExpiresAt = 0;
  private refreshInFlight?: Promise<string>;
  private panelId: string;

  constructor(
    private readonly email: string,
    private readonly password: string,
    panelId = '',
  ) {
    this.panelId = panelId;
  }

  setPanelId(panelId: string): void {
    this.panelId = panelId;
  }

  getPanelId(): string {
    return this.panelId;
  }

  async getPanelList(): Promise<PanelListItem[]> {
    const data = await this.requestJson<PanelListItem[]>({
      method: 'GET',
      url: `${API_URL}/api/account/GetPanelList`,
    });
    return Array.isArray(data) ? data : [];
  }

  async getPanelInfo(): Promise<PanelInfo> {
    return this.requestJson<PanelInfo>({
      method: 'GET',
      url: `${API_URL}/api/Panel/GetPanel?panelId=${encodeURIComponent(this.panelId)}`,
    });
  }

  async getPanelStatus(): Promise<PanelStatus> {
    return this.requestJson<PanelStatus>({
      method: 'GET',
      url: `${API_URL}/api/panel/GetPanelStatus?panelId=${encodeURIComponent(this.panelId)}`,
    });
  }

  async getSmartPlugStatus(): Promise<Record<string, unknown>[]> {
    return this.requestJsonArray(`${API_URL}/api/panel/GetSmartplugStatus?panelId=${encodeURIComponent(this.panelId)}`);
  }

  async getLockStatus(): Promise<Record<string, unknown>[]> {
    return this.requestJsonArray(`${API_URL}/api/panel/GetLockStatus?panelId=${encodeURIComponent(this.panelId)}`);
  }

  async getLegacyTemperatures(): Promise<Record<string, unknown>[]> {
    return this.requestJsonArray(`${API_URL}/api/Panel/GetTemperatures?panelId=${encodeURIComponent(this.panelId)}`);
  }

  async postHouseCheck(path: string): Promise<unknown | undefined> {
    return this.requestOptionalJson({
      method: 'POST',
      url: `${API_URL}${path}`,
      body: { PanelId: this.panelId },
    });
  }

  async getHouseCheck(path: string): Promise<unknown | undefined> {
    return this.requestOptionalJson({
      method: 'GET',
      url: `${API_URL}${path.replace('{panelId}', encodeURIComponent(this.panelId))}`,
    });
  }

  async arm(mode: 'full' | 'partial', code?: string): Promise<void> {
    const path = mode === 'full' ? '/api/Panel/Arm' : '/api/Panel/PartialArm';
    const payload: Record<string, string> = { PanelId: this.panelId };
    if (code) {
      payload.PanelCode = code;
    }
    await this.requestJson({
      method: 'POST',
      url: `${API_URL}${path}`,
      body: payload,
    });
  }

  async disarm(code: string): Promise<void> {
    await this.requestJson({
      method: 'POST',
      url: `${API_URL}/api/Panel/Disarm`,
      body: { PanelId: this.panelId, PanelCode: code },
    });
  }

  async setSmartPlug(plugId: string, on: boolean): Promise<void> {
    const path = on ? '/api/Panel/TurnOnSmartplug' : '/api/Panel/TurnOffSmartplug';
    const url = `${API_URL}${path}?switchId=${encodeURIComponent(plugId)}&panelId=${encodeURIComponent(this.panelId)}`;
    await this.requestJson({
      method: 'POST',
      url,
      body: null,
    });
  }

  async setLock(serialNo: string, locked: boolean, code: string): Promise<void> {
    const path = locked ? '/api/Panel/Lock' : '/api/Panel/Unlock';
    await this.requestJson({
      method: 'POST',
      url: `${API_URL}${path}`,
      body: {
        LockSerial: serialNo,
        SerialNo: serialNo,
        PanelCode: code,
        PanelId: this.panelId,
      },
    });
  }

  private async requestJsonArray(url: string): Promise<Record<string, unknown>[]> {
    const data = await this.requestJson<unknown>({ method: 'GET', url });
    return Array.isArray(data) ? data as Record<string, unknown>[] : [];
  }

  private async requestOptionalJson(options: RequestOptions): Promise<unknown | undefined> {
    try {
      return await this.requestJson(options);
    } catch (error) {
      if (error instanceof SectorApiError && (error.status === 404 || error.status === 400)) {
        return undefined;
      }
      throw error;
    }
  }

  private async requestJson<T>(options: RequestOptions, retried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined && options.body !== null) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.auth !== false) {
      headers.Authorization = `Bearer ${await this.getToken()}`;
    }

    const response = await fetch(options.url, {
      method: options.method,
      headers,
      body: options.body === undefined || options.body === null
        ? undefined
        : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      this.invalidateToken();
      if (!retried && options.auth !== false) {
        return this.requestJson<T>(options, true);
      }
      throw new SectorAuthError(
        `Authentication failed during ${options.method} ${options.url} (HTTP ${response.status})`,
        response.status,
      );
    }

    if (response.status === 400) {
      const text = await response.text();
      throw new SectorApiError(
        `Bad request during ${options.method} ${options.url} (HTTP 400): ${text}`,
        400,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new SectorApiError(
        `Request failed during ${options.method} ${options.url} (HTTP ${response.status}): ${text}`,
        response.status,
      );
    }

    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
      return await response.json() as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() / 1000 < this.tokenExpiresAt) {
      return this.token;
    }
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.renewToken().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  private async renewToken(): Promise<string> {
    const response = await fetch(`${API_URL}/api/Login/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ UserId: this.email, Password: this.password }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401) {
      throw new SectorAuthError('Unable to login — unauthorized (HTTP 401)', 401);
    }
    if (response.status === 400) {
      throw new SectorApiError('Unable to login — broken API support (HTTP 400)', 400);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new SectorApiError(`Unable to login (HTTP ${response.status}): ${text}`, response.status);
    }

    const json = await response.json() as { AuthorizationToken?: string };
    const accessToken = json.AuthorizationToken;
    if (!accessToken) {
      throw new SectorAuthError('Login succeeded but no AuthorizationToken was returned');
    }

    this.token = accessToken;
    this.tokenExpiresAt = parseJwtExp(accessToken) - 5;
    return accessToken;
  }

  private invalidateToken(): void {
    this.token = undefined;
    this.tokenExpiresAt = 0;
  }
}
