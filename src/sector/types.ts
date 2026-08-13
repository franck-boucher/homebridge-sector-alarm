export class SectorApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'SectorApiError';
  }
}

export class SectorAuthError extends SectorApiError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = 'SectorAuthError';
  }
}

export interface PanelListItem {
  PanelId: string;
  DisplayName?: string;
}

export interface PanelInfo {
  PanelId?: string;
  DisplayName?: string;
  Capabilities?: string[];
  PanelCodeLength?: number;
  QuickArmEnabled?: boolean;
  CanPartialArm?: boolean;
  Locks?: Record<string, unknown>[];
  Temperatures?: Record<string, unknown>[];
  Smartplugs?: Record<string, unknown>[];
}

export interface PanelStatus {
  IsOnline?: boolean;
  Status?: number;
}

export interface HouseCheckDevice {
  serialNo: string;
  name: string;
  type?: string;
  closed?: boolean;
  alarm?: boolean;
  lowBattery?: boolean;
  temperature?: number;
  humidity?: number;
}

export interface ContactDevice {
  serialNo: string;
  name: string;
  closed: boolean;
  lowBattery?: boolean;
}

export interface OutletDevice {
  serialNo: string;
  plugId: string;
  name: string;
  on: boolean;
}

export interface LockDevice {
  serialNo: string;
  name: string;
  locked: boolean;
  lowBattery?: boolean;
}

export interface ClimateDevice {
  serialNo: string;
  name: string;
  temperature?: number;
  humidity?: number;
  lowBattery?: boolean;
}

export interface SafetyDevice {
  serialNo: string;
  name: string;
  kind: 'leak' | 'smoke';
  triggered: boolean;
  lowBattery?: boolean;
}

export interface AlarmState {
  panelId: string;
  name: string;
  online: boolean;
  status: number;
  quickArm: boolean;
  canPartialArm: boolean;
  codeLength: number;
  legacyHomeScreen: boolean;
}

export interface SectorSnapshot {
  alarm: AlarmState;
  contacts: ContactDevice[];
  outlets: OutletDevice[];
  locks: LockDevice[];
  climate: ClimateDevice[];
  safety: SafetyDevice[];
}

export type AccessoryKind = 'alarm' | 'contact' | 'outlet' | 'lock' | 'climate' | 'leak' | 'smoke';

export interface AccessoryContext {
  kind: AccessoryKind;
  serialNo: string;
  name: string;
  model: string;
  plugId?: string;
}
