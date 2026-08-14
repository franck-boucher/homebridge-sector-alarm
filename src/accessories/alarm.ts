import type { CharacteristicValue, PlatformAccessory } from 'homebridge';

import type { SectorPlatform } from '../platform.js';
import {
  homeKitReportedTargetState,
  homeKitTargetToArmMode,
  HomeKitAlarmState,
  sectorStatusToCurrentState,
  securitySystemTargetValidValues,
} from '../mapping.js';
import { MANUFACTURER } from '../settings.js';

export class AlarmAccessory {
  private currentState: number = HomeKitAlarmState.Disarmed;

  constructor(
    private readonly platform: SectorPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;
    const alarm = this.platform.coordinator.snapshot?.alarm;

    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, 'Alarm panel')
      .setCharacteristic(Characteristic.SerialNumber, this.accessory.context.serialNo);

    const service = this.accessory.getService(Service.SecuritySystem)
      || this.accessory.addService(Service.SecuritySystem, this.accessory.displayName);

    service.setCharacteristic(Characteristic.Name, this.accessory.displayName);

    service.getCharacteristic(Characteristic.SecuritySystemTargetState)
      .setProps({ validValues: securitySystemTargetValidValues(Boolean(alarm?.canPartialArm)) })
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this));

    service.getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .onGet(this.getCurrentState.bind(this));

    this.platform.coordinator.onUpdate(() => this.pushState());
    this.pushState();
  }

  private getCurrentState(): CharacteristicValue {
    return this.readState();
  }

  private getTargetState(): CharacteristicValue {
    return homeKitReportedTargetState(this.readState());
  }

  private async setTargetState(value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    const service = this.accessory.getService(this.platform.Service.SecuritySystem)!;
    let mode: 'full' | 'partial' | 'disarm';
    try {
      mode = homeKitTargetToArmMode(value as number);
    } catch {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST,
      );
    }
    const alarm = this.platform.coordinator.snapshot?.alarm;
    const code = this.platform.config.code;

    if (alarm && !alarm.online) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    if (mode === 'disarm' && !this.platform.config.allowDisarm) {
      this.platform.log.warn('Rejected HomeKit disarm (allowDisarm is false)');
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.INSUFFICIENT_AUTHORIZATION,
      );
    }

    this.platform.log.info('Setting Sector alarm to %s', mode);

    try {
      if (mode === 'disarm') {
        await this.platform.client.disarm(code);
      } else {
        await this.platform.client.arm(mode, code);
      }
      service.updateCharacteristic(Characteristic.SecuritySystemTargetState, value);
      await this.platform.coordinator.refresh(false);
    } catch (error) {
      this.platform.log.error('Failed to set alarm state:', error instanceof Error ? error.message : error);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private readState(): number {
    const alarm = this.platform.coordinator.snapshot?.alarm;
    if (!alarm) {
      return this.currentState;
    }
    this.currentState = sectorStatusToCurrentState(alarm.status, alarm.online, this.currentState);
    return this.currentState;
  }

  private pushState(): void {
    const { Characteristic, Service } = this.platform;
    const service = this.accessory.getService(Service.SecuritySystem);
    const alarm = this.platform.coordinator.snapshot?.alarm;
    if (!service || !alarm) {
      return;
    }
    const current = this.readState();
    const target = homeKitReportedTargetState(current);
    service.updateCharacteristic(Characteristic.SecuritySystemCurrentState, current);
    if (current !== HomeKitAlarmState.AlarmTriggered) {
      service.updateCharacteristic(Characteristic.SecuritySystemTargetState, target);
    }
    service.updateCharacteristic(
      Characteristic.StatusFault,
      alarm.online ? Characteristic.StatusFault.NO_FAULT : Characteristic.StatusFault.GENERAL_FAULT,
    );
  }
}
