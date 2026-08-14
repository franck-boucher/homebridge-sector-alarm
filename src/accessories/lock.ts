import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { SectorPlatform } from '../platform.js';
import { MANUFACTURER } from '../settings.js';

export class LockAccessory {
  constructor(
    private readonly platform: SectorPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, 'Smart Lock')
      .setCharacteristic(Characteristic.SerialNumber, this.accessory.context.serialNo);

    const service = this.accessory.getService(Service.LockMechanism)
      || this.accessory.addService(Service.LockMechanism, this.accessory.displayName);
    service.setCharacteristic(Characteristic.Name, this.accessory.displayName);
    service.getCharacteristic(Characteristic.LockCurrentState)
      .onGet(() => this.currentState());
    service.getCharacteristic(Characteristic.LockTargetState)
      .onGet(() => this.targetState())
      .onSet(this.setTargetState.bind(this));

    this.platform.coordinator.onUpdate(() => this.pushState(service));
    this.pushState(service);
  }

  private device() {
    return this.platform.coordinator.snapshot?.locks.find(
      (item) => item.serialNo === this.accessory.context.serialNo,
    );
  }

  private currentState(): CharacteristicValue {
    const device = this.device();
    const { Characteristic } = this.platform;
    if (!device) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return device.locked
      ? Characteristic.LockCurrentState.SECURED
      : Characteristic.LockCurrentState.UNSECURED;
  }

  private targetState(): CharacteristicValue {
    const device = this.device();
    const { Characteristic } = this.platform;
    if (!device) {
      return Characteristic.LockTargetState.SECURED;
    }
    return device.locked
      ? Characteristic.LockTargetState.SECURED
      : Characteristic.LockTargetState.UNSECURED;
  }

  private async setTargetState(value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    const locked = value === Characteristic.LockTargetState.SECURED;
    if (!this.platform.config.allowLockControl) {
      this.platform.log.warn('Rejected HomeKit lock change (allowLockControl is false)');
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.INSUFFICIENT_AUTHORIZATION,
      );
    }
    try {
      await this.platform.client.setLock(this.accessory.context.serialNo, locked, this.platform.config.code);
      await this.platform.coordinator.refresh(false);
    } catch (error) {
      this.platform.log.error('Failed to set lock:', error instanceof Error ? error.message : error);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private pushState(service: Service): void {
    const device = this.device();
    if (!device) {
      return;
    }
    const { Characteristic } = this.platform;
    const current = device.locked
      ? Characteristic.LockCurrentState.SECURED
      : Characteristic.LockCurrentState.UNSECURED;
    const target = device.locked
      ? Characteristic.LockTargetState.SECURED
      : Characteristic.LockTargetState.UNSECURED;
    service.updateCharacteristic(Characteristic.LockCurrentState, current);
    service.updateCharacteristic(Characteristic.LockTargetState, target);
    if (device.lowBattery !== undefined) {
      service.updateCharacteristic(
        Characteristic.StatusLowBattery,
        device.lowBattery
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
    }
  }
}
