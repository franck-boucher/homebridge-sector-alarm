import type { PlatformConfig } from 'homebridge';

import { DEFAULT_POLL_INTERVAL_S } from './settings.js';

export interface SectorPlatformConfig extends PlatformConfig {
  email?: string;
  password?: string;
  code?: string;
  panelId?: string;
  pollInterval?: number;
  exposeSensors?: boolean;
  exposePlugs?: boolean;
  exposeLocks?: boolean;
  exposeClimate?: boolean;
  allowDisarm?: boolean;
  allowLockControl?: boolean;
}

export interface ResolvedSectorConfig {
  name: string;
  email: string;
  password: string;
  code: string;
  panelId?: string;
  pollInterval: number;
  exposeSensors: boolean;
  exposePlugs: boolean;
  exposeLocks: boolean;
  exposeClimate: boolean;
  allowDisarm: boolean;
  allowLockControl: boolean;
}

export function resolveConfig(config: SectorPlatformConfig): ResolvedSectorConfig | string {
  const email = config.email?.trim();
  const password = config.password;
  const code = config.code?.trim();

  if (!email || !password) {
    return 'email and password are required (Mes Pages credentials).';
  }
  if (!code) {
    return 'code is required (panel / keypad PIN).';
  }
  if (!/^\d{4,10}$/.test(code)) {
    return 'code must be 4–10 digits (panel / keypad PIN).';
  }

  const pollInterval = Number(config.pollInterval ?? DEFAULT_POLL_INTERVAL_S);
  if (!Number.isFinite(pollInterval) || pollInterval < 15) {
    return 'pollInterval must be at least 15 seconds.';
  }

  return {
    name: config.name?.trim() || 'Sector Alarm',
    email,
    password,
    code,
    panelId: config.panelId?.trim() || undefined,
    pollInterval,
    exposeSensors: config.exposeSensors !== false,
    exposePlugs: config.exposePlugs !== false,
    exposeLocks: config.exposeLocks !== false,
    exposeClimate: config.exposeClimate !== false,
    allowDisarm: config.allowDisarm !== false,
    allowLockControl: config.allowLockControl !== false,
  };
}
