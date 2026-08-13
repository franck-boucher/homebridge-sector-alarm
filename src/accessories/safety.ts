import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { SectorPlatform } from '../platform.js';
import { MANUFACTURER } from '../settings.js';

export class SafetyAccessory {
  constructor(
    private readonly platform: SectorPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;
    const kind = this.accessory.context.kind as 'leak' | 'smoke';
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, kind === 'leak' ? 'Leakage Detector' : 'Smoke Detector')
      .setCharacteristic(Characteristic.SerialNumber, this.accessory.context.serialNo);

    if (kind === 'leak') {
      const service = this.accessory.getService(Service.LeakSensor)
        || this.accessory.addService(Service.LeakSensor, this.accessory.displayName);
      service.setCharacteristic(Characteristic.Name, this.accessory.displayName);
      service.getCharacteristic(Characteristic.LeakDetected)
        .onGet(() => this.leakState());
      this.platform.coordinator.onUpdate(() => this.pushLeak(service));
      this.pushLeak(service);
      return;
    }

    const service = this.accessory.getService(Service.SmokeSensor)
      || this.accessory.addService(Service.SmokeSensor, this.accessory.displayName);
    service.setCharacteristic(Characteristic.Name, this.accessory.displayName);
    service.getCharacteristic(Characteristic.SmokeDetected)
      .onGet(() => this.smokeState());
    this.platform.coordinator.onUpdate(() => this.pushSmoke(service));
    this.pushSmoke(service);
  }

  private device() {
    return this.platform.coordinator.snapshot?.safety.find(
      (item) => item.serialNo === this.accessory.context.serialNo,
    );
  }

  private leakState(): CharacteristicValue {
    const device = this.device();
    const { Characteristic } = this.platform;
    if (!device) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return device.triggered
      ? Characteristic.LeakDetected.LEAK_DETECTED
      : Characteristic.LeakDetected.LEAK_NOT_DETECTED;
  }

  private smokeState(): CharacteristicValue {
    const device = this.device();
    const { Characteristic } = this.platform;
    if (!device) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return device.triggered
      ? Characteristic.SmokeDetected.SMOKE_DETECTED
      : Characteristic.SmokeDetected.SMOKE_NOT_DETECTED;
  }

  private pushLeak(service: Service): void {
    const device = this.device();
    if (!device) {
      return;
    }
    const { Characteristic } = this.platform;
    service.updateCharacteristic(
      Characteristic.LeakDetected,
      device.triggered
        ? Characteristic.LeakDetected.LEAK_DETECTED
        : Characteristic.LeakDetected.LEAK_NOT_DETECTED,
    );
    this.updateBattery(service, device.lowBattery);
  }

  private pushSmoke(service: Service): void {
    const device = this.device();
    if (!device) {
      return;
    }
    const { Characteristic } = this.platform;
    service.updateCharacteristic(
      Characteristic.SmokeDetected,
      device.triggered
        ? Characteristic.SmokeDetected.SMOKE_DETECTED
        : Characteristic.SmokeDetected.SMOKE_NOT_DETECTED,
    );
    this.updateBattery(service, device.lowBattery);
  }

  private updateBattery(service: Service, lowBattery?: boolean): void {
    if (lowBattery === undefined) {
      return;
    }
    const { Characteristic } = this.platform;
    service.updateCharacteristic(
      Characteristic.StatusLowBattery,
      lowBattery
        ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    );
  }
}
