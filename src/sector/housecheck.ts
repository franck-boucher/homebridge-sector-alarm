import { parseNumber, serialOf, labelOf } from '../mapping.js';
import type { HouseCheckDevice } from './types.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeDevice(raw: Record<string, unknown>): HouseCheckDevice | undefined {
  const serialNo = serialOf(raw);
  if (!serialNo) {
    return undefined;
  }

  const closed = typeof raw.Closed === 'boolean' ? raw.Closed : undefined;
  const alarm = typeof raw.Alarm === 'boolean' ? raw.Alarm : undefined;
  const lowBattery = typeof raw.LowBattery === 'boolean'
    ? raw.LowBattery
    : typeof raw.BatteryLow === 'boolean'
      ? raw.BatteryLow
      : undefined;
  const temperature = parseNumber(raw.Temperature);
  const humidity = parseNumber(raw.Humidity);
  const type = typeof raw.Type === 'string' ? raw.Type : undefined;

  return {
    serialNo,
    name: labelOf(raw, serialNo),
    type,
    closed,
    alarm,
    lowBattery,
    temperature,
    humidity,
  };
}

/**
 * HouseCheck payloads are either Floors → Rooms → Devices
 * or Sections → Places → Components.
 */
export function flattenHouseCheck(payload: unknown): HouseCheckDevice[] {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const devices: HouseCheckDevice[] = [];

  for (const floor of asArray(root.Floors)) {
    const floorRecord = asRecord(floor);
    if (!floorRecord) {
      continue;
    }
    for (const room of asArray(floorRecord.Rooms)) {
      const roomRecord = asRecord(room);
      if (!roomRecord) {
        continue;
      }
      for (const device of asArray(roomRecord.Devices)) {
        const deviceRecord = asRecord(device);
        if (!deviceRecord) {
          continue;
        }
        const normalized = normalizeDevice(deviceRecord);
        if (normalized) {
          devices.push(normalized);
        }
      }
    }
  }

  for (const section of asArray(root.Sections)) {
    const sectionRecord = asRecord(section);
    if (!sectionRecord) {
      continue;
    }
    for (const place of asArray(sectionRecord.Places)) {
      const placeRecord = asRecord(place);
      if (!placeRecord) {
        continue;
      }
      for (const component of asArray(placeRecord.Components)) {
        const componentRecord = asRecord(component);
        if (!componentRecord) {
          continue;
        }
        const normalized = normalizeDevice(componentRecord);
        if (normalized) {
          devices.push(normalized);
        }
      }
    }
  }

  return devices;
}
