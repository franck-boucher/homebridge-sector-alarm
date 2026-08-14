/**
 * Sector panel Status codes (same mapping as gjohansson-ST/sector for Home Assistant):
 * 1 = disarmed, 2 = partial / home, 3 = armed away, 0 = unknown.
 *
 * HomeKit SecuritySystem:
 * STAY_ARM = 0, AWAY_ARM = 1, NIGHT_ARM = 2, DISARMED = 3, ALARM_TRIGGERED = 4
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
  case HomeKitAlarmState.Disarmed:
    return 'disarm';
  default:
    throw new Error(`Unsupported HomeKit alarm target: ${target}`);
  }
}

/**
 * TargetState cannot be ALARM_TRIGGERED. A disarmed panel must still report
 * DISARMED so HomeKit does not keep an arm target after a keypad Off.
 */
export function homeKitReportedTargetState(current: number): number {
  return current === HomeKitAlarmState.AlarmTriggered
    ? HomeKitAlarmState.AwayArm
    : current;
}

/**
 * HAP drops TargetState updates that are not in validValues.
 * DISARM must stay listed so status-only mode can publish Off; allowDisarm
 * only rejects HomeKit disarm writes.
 */
export function securitySystemTargetValidValues(canPartialArm: boolean): number[] {
  if (canPartialArm) {
    return [
      HomeKitAlarmState.StayArm,
      HomeKitAlarmState.AwayArm,
      HomeKitAlarmState.NightArm,
      HomeKitAlarmState.Disarmed,
    ];
  }
  return [
    HomeKitAlarmState.AwayArm,
    HomeKitAlarmState.Disarmed,
  ];
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
