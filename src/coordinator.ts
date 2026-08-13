import type { Logging } from 'homebridge';

import type { ResolvedSectorConfig } from './config.js';
import { isLockedStatus, isOnStatus, labelOf, parseNumber, serialOf } from './mapping.js';
import { flattenHouseCheck } from './sector/housecheck.js';
import { SectorApi } from './sector/api.js';
import type {
  AlarmState,
  ClimateDevice,
  ContactDevice,
  LockDevice,
  OutletDevice,
  PanelInfo,
  SafetyDevice,
  SectorSnapshot,
} from './sector/types.js';
import { CLIMATE_POLL_INTERVAL_S } from './settings.js';

type Listener = () => void;

export class SectorCoordinator {
  snapshot?: SectorSnapshot;
  private listeners = new Set<Listener>();
  private pollTimer?: ReturnType<typeof setInterval>;
  private climateTimer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private lastClimateAt = 0;

  constructor(
    readonly log: Logging,
    readonly api: SectorApi,
    readonly config: ResolvedSectorConfig,
  ) {}

  onUpdate(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<SectorSnapshot> {
    this.snapshot = await this.refresh(true);
    this.pollTimer = setInterval(() => {
      this.refresh(false).catch((error: unknown) => {
        this.log.error('Sector poll failed:', error instanceof Error ? error.message : error);
      });
    }, this.config.pollInterval * 1000);
    this.climateTimer = setInterval(() => {
      this.refreshClimate().catch((error: unknown) => {
        this.log.error('Sector climate poll failed:', error instanceof Error ? error.message : error);
      });
    }, CLIMATE_POLL_INTERVAL_S * 1000);
    return this.snapshot;
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    if (this.climateTimer) {
      clearInterval(this.climateTimer);
    }
  }

  async refresh(includeClimate: boolean): Promise<SectorSnapshot> {
    const panelInfo = await this.api.getPanelInfo();
    const panelStatus = await this.api.getPanelStatus();
    const alarm = this.buildAlarm(panelInfo, panelStatus);

    const [outlets, locks, contacts, safety, climate] = await Promise.all([
      this.config.exposePlugs ? this.fetchOutlets(panelInfo) : Promise.resolve([]),
      this.config.exposeLocks ? this.fetchLocks(panelInfo) : Promise.resolve([]),
      this.config.exposeSensors && !alarm.legacyHomeScreen ? this.fetchContacts() : Promise.resolve([]),
      this.config.exposeSensors && !alarm.legacyHomeScreen ? this.fetchSafety() : Promise.resolve([]),
      includeClimate && this.config.exposeClimate
        ? this.fetchClimate(panelInfo, alarm.legacyHomeScreen)
        : Promise.resolve(this.snapshot?.climate ?? []),
    ]);

    if (includeClimate) {
      this.lastClimateAt = Date.now();
    }

    this.snapshot = { alarm, outlets, locks, contacts, safety, climate };
    this.notify();
    return this.snapshot;
  }

  async refreshClimate(): Promise<void> {
    if (!this.snapshot || !this.config.exposeClimate || this.stopped) {
      return;
    }
    if (Date.now() - this.lastClimateAt < (CLIMATE_POLL_INTERVAL_S - 5) * 1000) {
      return;
    }
    const panelInfo = await this.api.getPanelInfo();
    const climate = await this.fetchClimate(panelInfo, this.snapshot.alarm.legacyHomeScreen);
    this.lastClimateAt = Date.now();
    this.snapshot = { ...this.snapshot, climate };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private buildAlarm(panelInfo: PanelInfo, panelStatus: { IsOnline?: boolean; Status?: number }): AlarmState {
    const capabilities = panelInfo.Capabilities ?? [];
    return {
      panelId: this.api.getPanelId(),
      name: panelInfo.DisplayName?.trim() || this.config.name,
      online: Boolean(panelStatus.IsOnline),
      status: typeof panelStatus.Status === 'number' ? panelStatus.Status : 0,
      quickArm: Boolean(panelInfo.QuickArmEnabled),
      canPartialArm: Boolean(panelInfo.CanPartialArm),
      codeLength: panelInfo.PanelCodeLength ?? 0,
      legacyHomeScreen: capabilities.includes('UseLegacyHomeScreen'),
    };
  }

  private async fetchOutlets(panelInfo: PanelInfo): Promise<OutletDevice[]> {
    const listed = panelInfo.Smartplugs ?? [];
    if (listed.length === 0) {
      return [];
    }
    const statuses = await this.api.getSmartPlugStatus();
    const source = statuses.length > 0 ? statuses : listed;
    const outlets: OutletDevice[] = [];
    for (const item of source) {
      const serialNo = serialOf(item);
      const plugId = item.Id !== undefined && item.Id !== null ? String(item.Id) : undefined;
      if (!serialNo || !plugId) {
        continue;
      }
      outlets.push({
        serialNo,
        plugId,
        name: labelOf(item, serialNo),
        on: isOnStatus(item.Status),
      });
    }
    return outlets;
  }

  private async fetchLocks(panelInfo: PanelInfo): Promise<LockDevice[]> {
    const listed = panelInfo.Locks ?? [];
    if (listed.length === 0) {
      return [];
    }
    const statuses = await this.api.getLockStatus();
    const source = statuses.length > 0 ? statuses : listed;
    const locks: LockDevice[] = [];
    for (const item of source) {
      const serialNo = serialOf(item);
      if (!serialNo) {
        continue;
      }
      const lowBattery = typeof item.BatteryLow === 'boolean' ? item.BatteryLow : undefined;
      locks.push({
        serialNo,
        name: labelOf(item, serialNo),
        locked: isLockedStatus(item.Status),
        lowBattery,
      });
    }
    return locks;
  }

  private async fetchContacts(): Promise<ContactDevice[]> {
    const payload = await this.api.postHouseCheck('/api/housecheck/doorsandwindows');
    if (!payload) {
      return [];
    }
    return flattenHouseCheck(payload)
      .filter((device) => typeof device.closed === 'boolean')
      .map((device) => ({
        serialNo: device.serialNo,
        name: device.name,
        closed: device.closed === true,
        lowBattery: device.lowBattery,
      }));
  }

  private async fetchSafety(): Promise<SafetyDevice[]> {
    const [leaks, smoke] = await Promise.all([
      this.api.postHouseCheck('/api/v2/housecheck/leakagedetectors'),
      this.api.postHouseCheck('/api/v2/housecheck/smokedetectors'),
    ]);
    const devices: SafetyDevice[] = [];
    for (const device of flattenHouseCheck(leaks)) {
      devices.push({
        serialNo: device.serialNo,
        name: device.name,
        kind: 'leak',
        triggered: device.alarm === true,
        lowBattery: device.lowBattery,
      });
    }
    for (const device of flattenHouseCheck(smoke)) {
      devices.push({
        serialNo: device.serialNo,
        name: device.name,
        kind: 'smoke',
        triggered: device.alarm === true,
        lowBattery: device.lowBattery,
      });
    }
    return devices;
  }

  private async fetchClimate(panelInfo: PanelInfo, legacy: boolean): Promise<ClimateDevice[]> {
    const bySerial = new Map<string, ClimateDevice>();

    const merge = (device: ClimateDevice) => {
      const existing = bySerial.get(device.serialNo);
      if (!existing) {
        bySerial.set(device.serialNo, device);
        return;
      }
      bySerial.set(device.serialNo, {
        ...existing,
        name: device.name || existing.name,
        temperature: device.temperature ?? existing.temperature,
        humidity: device.humidity ?? existing.humidity,
        lowBattery: device.lowBattery ?? existing.lowBattery,
      });
    };

    if (legacy || (panelInfo.Temperatures ?? []).length > 0) {
      const temps = await this.api.getLegacyTemperatures().catch(() => panelInfo.Temperatures ?? []);
      for (const item of temps) {
        const serialNo = serialOf(item);
        if (!serialNo) {
          continue;
        }
        merge({
          serialNo,
          name: labelOf(item, serialNo),
          temperature: parseNumber(item.Temperature),
        });
      }
    }

    if (!legacy) {
      const [temps, humidity] = await Promise.all([
        this.api.postHouseCheck('/api/v2/housecheck/temperatures'),
        this.api.getHouseCheck('/api/housecheck/panels/{panelId}/humidity'),
      ]);
      for (const device of flattenHouseCheck(temps)) {
        merge({
          serialNo: device.serialNo,
          name: device.name,
          temperature: device.temperature,
          lowBattery: device.lowBattery,
        });
      }
      for (const device of flattenHouseCheck(humidity)) {
        merge({
          serialNo: device.serialNo,
          name: device.name,
          humidity: device.humidity,
          temperature: device.temperature,
          lowBattery: device.lowBattery,
        });
      }
    }

    return [...bySerial.values()].filter((device) => device.temperature !== undefined || device.humidity !== undefined);
  }
}
