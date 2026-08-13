import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { SectorPlatform } from '../platform.js';
import { MANUFACTURER } from '../settings.js';

export class ClimateAccessory {
  constructor(
    private readonly platform: SectorPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, 'Climate')
      .setCharacteristic(Characteristic.SerialNumber, this.accessory.context.serialNo);

    const device = this.device();
    if (device?.temperature !== undefined || this.accessory.getService(Service.TemperatureSensor)) {
      const temperature = this.accessory.getService(Service.TemperatureSensor)
        || this.accessory.addService(Service.TemperatureSensor, `${this.accessory.displayName} Temperature`, 'temperature');
      temperature.setCharacteristic(Characteristic.Name, `${this.accessory.displayName} Temperature`);
      temperature.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({ minValue: -50, maxValue: 100, minStep: 0.1 })
        .onGet(() => this.temperature());
    }

    if (device?.humidity !== undefined || this.accessory.getService(Service.HumiditySensor)) {
      const humidity = this.accessory.getService(Service.HumiditySensor)
        || this.accessory.addService(Service.HumiditySensor, `${this.accessory.displayName} Humidity`, 'humidity');
      humidity.setCharacteristic(Characteristic.Name, `${this.accessory.displayName} Humidity`);
      humidity.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => this.humidity());
    }

    this.platform.coordinator.onUpdate(() => this.pushState());
    this.pushState();
  }

  private device() {
    return this.platform.coordinator.snapshot?.climate.find(
      (item) => item.serialNo === this.accessory.context.serialNo,
    );
  }

  private temperature(): CharacteristicValue {
    const value = this.device()?.temperature;
    if (value === undefined) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return value;
  }

  private humidity(): CharacteristicValue {
    const value = this.device()?.humidity;
    if (value === undefined) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return value;
  }

  private pushState(): void {
    const device = this.device();
    if (!device) {
      return;
    }
    const { Characteristic, Service } = this.platform;
    const temperature = this.accessory.getService(Service.TemperatureSensor);
    const humidity = this.accessory.getService(Service.HumiditySensor);
    if (temperature && device.temperature !== undefined) {
      temperature.updateCharacteristic(Characteristic.CurrentTemperature, device.temperature);
    }
    if (humidity && device.humidity !== undefined) {
      humidity.updateCharacteristic(Characteristic.CurrentRelativeHumidity, device.humidity);
    }
    this.updateBattery(temperature, device.lowBattery);
    this.updateBattery(humidity, device.lowBattery);
  }

  private updateBattery(service: Service | undefined, lowBattery?: boolean): void {
    if (!service || lowBattery === undefined) {
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
