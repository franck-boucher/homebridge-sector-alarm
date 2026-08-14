import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { AlarmAccessory } from './accessories/alarm.js';
import { ClimateAccessory } from './accessories/climate.js';
import { ContactAccessory } from './accessories/contact.js';
import { LockAccessory } from './accessories/lock.js';
import { OutletAccessory } from './accessories/outlet.js';
import { SafetyAccessory } from './accessories/safety.js';
import { resolveConfig, type ResolvedSectorConfig, type SectorPlatformConfig } from './config.js';
import { SectorCoordinator } from './coordinator.js';
import { SectorApi } from './sector/api.js';
import type { AccessoryContext, AccessoryKind, SectorSnapshot } from './sector/types.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export class SectorPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories = new Map<string, PlatformAccessory>();
  public readonly discoveredCacheUUIDs: string[] = [];

  public config!: ResolvedSectorConfig;
  public client!: SectorApi;
  public coordinator!: SectorCoordinator;

  constructor(
    public readonly log: Logging,
    rawConfig: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    const resolved = resolveConfig(rawConfig as SectorPlatformConfig);
    if (typeof resolved === 'string') {
      this.log.error('Invalid Sector Alarm config: %s', resolved);
      return;
    }
    this.config = resolved;
    this.client = new SectorApi(resolved.email, resolved.password, resolved.panelId ?? '');
    this.coordinator = new SectorCoordinator(this.log, this.client, resolved);

    this.log.info('Sector Alarm platform initializing');
    if (!resolved.allowDisarm) {
      this.log.info('HomeKit disarm is disabled (allowDisarm=false)');
    }
    if (!resolved.allowLockControl) {
      this.log.info('HomeKit lock control is disabled (allowLockControl=false)');
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices().catch((error: unknown) => {
        this.log.error('Sector Alarm startup failed:', error instanceof Error ? error.message : error);
      });
    });

    this.api.on('shutdown', () => {
      this.coordinator?.stop();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private async discoverDevices(): Promise<void> {
    const panels = await this.client.getPanelList();
    if (panels.length === 0) {
      this.log.error('No Sector Alarm panels found for this account.');
      return;
    }

    let panelId = this.config.panelId;
    if (!panelId) {
      if (panels.length > 1) {
        const list = panels.map((panel) => `${panel.DisplayName ?? 'Panel'} (${panel.PanelId})`).join(', ');
        this.log.error('Several panels found. Set panelId in the plugin config. Available: %s', list);
        return;
      }
      panelId = String(panels[0].PanelId);
    }

    const selected = panels.find((panel) => String(panel.PanelId) === panelId);
    if (!selected) {
      this.log.error('Configured panelId %s was not found on this account.', panelId);
      return;
    }

    this.client.setPanelId(panelId);
    this.log.info('Using panel %s (%s)', selected.DisplayName ?? 'Sector', panelId);

    const snapshot = await this.coordinator.start();
    this.registerFromSnapshot(snapshot);

    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  private registerFromSnapshot(snapshot: SectorSnapshot): void {
    this.registerAccessory({
      kind: 'alarm',
      serialNo: snapshot.alarm.panelId,
      name: snapshot.alarm.name,
      model: 'Alarm panel',
    });

    for (const contact of snapshot.contacts) {
      this.registerAccessory({
        kind: 'contact',
        serialNo: contact.serialNo,
        name: contact.name,
        model: 'Door/Window Sensor',
      });
    }

    for (const outlet of snapshot.outlets) {
      this.registerAccessory({
        kind: 'outlet',
        serialNo: outlet.serialNo,
        name: outlet.name,
        model: 'Smart Plug',
        plugId: outlet.plugId,
      });
    }

    for (const lock of snapshot.locks) {
      this.registerAccessory({
        kind: 'lock',
        serialNo: lock.serialNo,
        name: lock.name,
        model: 'Smart Lock',
      });
    }

    for (const climate of snapshot.climate) {
      this.registerAccessory({
        kind: 'climate',
        serialNo: climate.serialNo,
        name: climate.name,
        model: 'Climate',
      });
    }

    for (const safety of snapshot.safety) {
      this.registerAccessory({
        kind: safety.kind,
        serialNo: safety.serialNo,
        name: safety.name,
        model: safety.kind === 'leak' ? 'Leakage Detector' : 'Smoke Detector',
      });
    }
  }

  private registerAccessory(context: AccessoryContext): void {
    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${context.kind}:${context.serialNo}`);
    this.discoveredCacheUUIDs.push(uuid);

    const existing = this.accessories.get(uuid);
    if (existing) {
      existing.context = context;
      existing.displayName = context.name;
      this.api.updatePlatformAccessories([existing]);
      this.bindAccessory(existing);
      this.log.info('Restoring accessory:', context.name);
      return;
    }

    const accessory = new this.api.platformAccessory(context.name, uuid);
    accessory.context = context;
    this.bindAccessory(accessory);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.accessories.set(uuid, accessory);
    this.log.info('Adding accessory:', context.name);
  }

  private bindAccessory(accessory: PlatformAccessory): void {
    const kind: AccessoryKind = accessory.context.kind;
    switch (kind) {
    case 'alarm':
      new AlarmAccessory(this, accessory);
      break;
    case 'contact':
      new ContactAccessory(this, accessory);
      break;
    case 'outlet':
      new OutletAccessory(this, accessory);
      break;
    case 'lock':
      new LockAccessory(this, accessory);
      break;
    case 'climate':
      new ClimateAccessory(this, accessory);
      break;
    case 'leak':
    case 'smoke':
      new SafetyAccessory(this, accessory);
      break;
    }
  }
}
