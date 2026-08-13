import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { SectorPlatform } from '../platform.js';
import { MANUFACTURER } from '../settings.js';

export class ContactAccessory {
  constructor(
    private readonly platform: SectorPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, 'Door/Window Sensor')
      .setCharacteristic(Characteristic.SerialNumber, this.accessory.context.serialNo);

    const service = this.accessory.getService(Service.ContactSensor)
      || this.accessory.addService(Service.ContactSensor, this.accessory.displayName);
    service.setCharacteristic(Characteristic.Name, this.accessory.displayName);
    service.getCharacteristic(Characteristic.ContactSensorState)
      .onGet(() => this.contactState());

    this.platform.coordinator.onUpdate(() => this.pushState(service));
    this.pushState(service);
  }

  private device() {
    return this.platform.coordinator.snapshot?.contacts.find(
      (item) => item.serialNo === this.accessory.context.serialNo,
    );
  }

  private contactState(): CharacteristicValue {
    const device = this.device();
    const { Characteristic } = this.platform;
    if (!device) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return device.closed
      ? Characteristic.ContactSensorState.CONTACT_DETECTED
      : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }

  private pushState(service: Service): void {
    const device = this.device();
    if (!device) {
      return;
    }
    const { Characteristic } = this.platform;
    service.updateCharacteristic(
      Characteristic.ContactSensorState,
      device.closed
        ? Characteristic.ContactSensorState.CONTACT_DETECTED
        : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
    );
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
