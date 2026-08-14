import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HomeKitAlarmState,
  homeKitReportedTargetState,
  homeKitTargetToArmMode,
  securitySystemTargetValidValues,
} from '../dist/mapping.js';

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

test('status-only mode can publish DISARMED as the HomeKit target', () => {
  assert.equal(homeKitReportedTargetState(HomeKitAlarmState.Disarmed), HomeKitAlarmState.Disarmed);
  assert.equal(homeKitReportedTargetState(HomeKitAlarmState.AwayArm), HomeKitAlarmState.AwayArm);
  assert.equal(homeKitReportedTargetState(HomeKitAlarmState.AlarmTriggered), HomeKitAlarmState.AwayArm);

  for (const canPartialArm of [true, false]) {
    const values = securitySystemTargetValidValues(canPartialArm);
    assert.equal(values.includes(HomeKitAlarmState.Disarmed), true);
    assert.equal(values.includes(homeKitReportedTargetState(HomeKitAlarmState.Disarmed)), true);
  }
});
