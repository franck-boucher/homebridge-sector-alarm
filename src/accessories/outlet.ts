import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { SectorPlatform } from '../platform.js';
import { MANUFACTURER } from '../settings.js';

export class OutletAccessory {
  private assumed?: boolean;

  constructor(
    private readonly platform: SectorPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, 'Smart Plug')
      .setCharacteristic(Characteristic.SerialNumber, this.accessory.context.serialNo);

    const service = this.accessory.getService(Service.Outlet)
      || this.accessory.addService(Service.Outlet, this.accessory.displayName);
    service.setCharacteristic(Characteristic.Name, this.accessory.displayName);
    service.getCharacteristic(Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));
    service.updateCharacteristic(Characteristic.OutletInUse, true);

    this.platform.coordinator.onUpdate(() => {
      this.assumed = undefined;
      this.pushState(service);
    });
    this.pushState(service);
  }

  private device() {
    return this.platform.coordinator.snapshot?.outlets.find(
      (item) => item.serialNo === this.accessory.context.serialNo,
    );
  }

  private getOn(): CharacteristicValue {
    if (this.assumed !== undefined) {
      return this.assumed;
    }
    const device = this.device();
    if (!device) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return device.on;
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const device = this.device();
    const plugId = device?.plugId ?? this.accessory.context.plugId;
    if (!plugId) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    this.assumed = Boolean(value);
    try {
      await this.platform.client.setSmartPlug(plugId, Boolean(value));
    } catch (error) {
      this.assumed = undefined;
      this.platform.log.error('Failed to set smart plug:', error instanceof Error ? error.message : error);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private pushState(service: Service): void {
    const device = this.device();
    if (!device || this.assumed !== undefined) {
      return;
    }
    service.updateCharacteristic(this.platform.Characteristic.On, device.on);
  }
}
