/**
 * Sector panel Status codes (same mapping as gjohansson-ST/sector for Home Assistant):
 * 1 = disarmed, 2 = partial / home, 3 = armed away, 0 = unknown.
 *
 * HomeKit SecuritySystem always uses Apple's labels (Home / Away / Night / Off).
 * Sector only has three modes, so Night is not exposed in the Home app:
 *   Disarmed (1) → Off
 *   Partial  (2) → Home (Stay)
 *   Armed    (3) → Away
 * Night is still accepted as a target (maps to partial) in case a client sends it.
 */
export const SectorAlarmStatus = {
  Unknown: 0,
  Disarmed: 1,
  Partial: 2,
  Armed: 3,
} as const;

export const HomeKitAlarmState = {
  StayArm: 0,
  AwayArm: 1,
  NightArm: 2,
  Disarmed: 3,
  AlarmTriggered: 4,
} as const;

/** Target states shown in Home: Home + Away + Off, or Away + Off if partial arm is unavailable. */
export function homeKitValidTargetStates(canPartialArm: boolean): number[] {
  if (canPartialArm) {
    return [HomeKitAlarmState.StayArm, HomeKitAlarmState.AwayArm, HomeKitAlarmState.Disarmed];
  }
  return [HomeKitAlarmState.AwayArm, HomeKitAlarmState.Disarmed];
}

/** Current states: same as targets, plus Alarm Triggered (HomeKit-only, not a Sector mode). */
export function homeKitValidCurrentStates(canPartialArm: boolean): number[] {
  return [...homeKitValidTargetStates(canPartialArm), HomeKitAlarmState.AlarmTriggered];
}

export function sectorStatusToCurrentState(status: number, online: boolean, previous?: number): number {
  if (!online && previous !== undefined) {
    return previous;
  }

  switch (status) {
  case SectorAlarmStatus.Armed:
    return HomeKitAlarmState.AwayArm;
  case SectorAlarmStatus.Partial:
    return HomeKitAlarmState.StayArm;
  case SectorAlarmStatus.Disarmed:
    return HomeKitAlarmState.Disarmed;
  default:
    return previous ?? HomeKitAlarmState.Disarmed;
  }
}

export function homeKitTargetToArmMode(target: number): 'full' | 'partial' | 'disarm' {
  switch (target) {
  case HomeKitAlarmState.AwayArm:
    return 'full';
  case HomeKitAlarmState.StayArm:
  case HomeKitAlarmState.NightArm:
    return 'partial';
  default:
    return 'disarm';
  }
}

export function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function isOnStatus(value: unknown): boolean {
  return String(value).toLowerCase() === 'on';
}

export function isLockedStatus(value: unknown): boolean {
  return String(value).toLowerCase() === 'lock';
}

export function serialOf(item: Record<string, unknown>): string | undefined {
  const serial = item.SerialNo ?? item.SerialString ?? item.Serial ?? item.serialNo;
  if (serial === undefined || serial === null) {
    return undefined;
  }
  return String(serial);
}

export function labelOf(item: Record<string, unknown>, fallback = 'Sector'): string {
  const label = item.Label ?? item.Name ?? item.DisplayName;
  if (typeof label === 'string' && label.trim()) {
    return label.trim();
  }
  return fallback;
}
