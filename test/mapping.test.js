import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HomeKitAlarmState, homeKitTargetToArmMode } from '../dist/mapping.js';

test('maps known HomeKit targets', () => {
  assert.equal(homeKitTargetToArmMode(HomeKitAlarmState.AwayArm), 'full');
  assert.equal(homeKitTargetToArmMode(HomeKitAlarmState.StayArm), 'partial');
  assert.equal(homeKitTargetToArmMode(HomeKitAlarmState.NightArm), 'partial');
  assert.equal(homeKitTargetToArmMode(HomeKitAlarmState.Disarmed), 'disarm');
});

test('does not default unknown HomeKit targets to disarm', () => {
  assert.throws(() => homeKitTargetToArmMode(HomeKitAlarmState.AlarmTriggered));
  assert.throws(() => homeKitTargetToArmMode(99));
});
