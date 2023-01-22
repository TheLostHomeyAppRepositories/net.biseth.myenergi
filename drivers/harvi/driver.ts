import { Driver } from 'homey';
import { MyEnergi } from 'myenergi-api';
import { AppKeyValues } from 'myenergi-api/dist/src/models/AppKeyValues';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { MyEnergiApp } from '../../app';
import { DataCallbackFunction } from '../../dataCallbackFunction';
import { Capability } from '../../models/Capability';
import { CapabilityType } from '../../models/CapabilityType';
import { PairDevice } from '../../models/PairDevice';
import { HarviData } from './HarviData';

export class HarviDriver extends Driver {

  private _dataUpdateCallbacks: DataCallbackFunction[] = [];
  private readonly _capabilities: Capability[] = [
    new Capability('meter_power', CapabilityType.Sensor, 1),
    new Capability('measure_power', CapabilityType.Sensor, 2),
    new Capability('ct1_type', CapabilityType.Sensor, 3),
    new Capability('measure_power_ct1', CapabilityType.Sensor, 4),
    new Capability('ct2_type', CapabilityType.Sensor, 5),
    new Capability('measure_power_ct2', CapabilityType.Sensor, 6),
    new Capability('ct3_type', CapabilityType.Sensor, 7),
    new Capability('measure_power_ct3', CapabilityType.Sensor, 8),
    new Capability('button.reset_meter', CapabilityType.Control, 9),
    new Capability('button.reload_capabilities', CapabilityType.Control, 10),
  ];

  public harviDevices: HarviData[] = [];
  public get capabilities(): string[] {
    return this._capabilities.sort((x, y) => x.order - y.order).map(value => value.name);
  }

  public get capabilityObjects(): Capability[] {
    return this._capabilities.sort((x, y) => x.order - y.order);
  }

  /**
   * onInit is called when the driver is initialized.
   */
  public async onInit() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.homey.app as MyEnergiApp).registerDataUpdateCallback((data: any) => this.dataUpdated(data));
    this.log('HarviDriver has been initialized');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public registerDataUpdateCallback(callback: any) {
    return this._dataUpdateCallbacks.push(callback);
  }

  public removeDataUpdateCallback(callbackId: number) {
    this._dataUpdateCallbacks.splice(callbackId, 1);
  }

  public async getDeviceAndSiteName(myenergiClient: MyEnergi, deviceId: string): Promise<{ siteNameResult: AppKeyValues; harviNameResult: KeyValue[]; }> {
    const [siteNameResult, harviNameResult] = await Promise.all([
      myenergiClient.getAppKeyFull("siteName"),
      myenergiClient.getAppKey(`H${deviceId}`),
    ]).catch(this.error) as [AppKeyValues, KeyValue[]];
    return { siteNameResult, harviNameResult };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dataUpdated(data: any[]) {
    this.log('Received data from app. Relaying to devices.');
    if (data) {
      data.forEach(d => {
        if (d.harvi) {
          this._dataUpdateCallbacks.forEach(callback => {
            callback(d.harvi);
          });
        }
      });
    }
  }

  private async loadHarviDevices(): Promise<HarviData[]> {
    try {
      for (const key in (this.homey.app as MyEnergiApp).clients) {
        if (Object.prototype.hasOwnProperty.call((this.homey.app as MyEnergiApp).clients, key)) {
          const client: MyEnergi = (this.homey.app as MyEnergiApp).clients[key];
          const harvis: HarviData[] = await client.getStatusHarviAll().catch(this.error) as HarviData[];
          for (const harvi of harvis) {
            if (this.harviDevices.findIndex((h: HarviData) => h.sno === harvi.sno) === -1) {
              harvi.myenergiClientId = key;
              this.harviDevices.push(harvi);
            }
          }
        }
      }
      return this.harviDevices;
    } catch (error) {
      this.error(error);
    }
    return [];
  }

  private async getHarviDevices(): Promise<PairDevice[]> {
    const harviDevices = await this.loadHarviDevices().catch(this.error) as HarviData[];
    return await Promise.all(harviDevices.map(async (v: HarviData): Promise<PairDevice> => {
      let deviceName = `Harvi ${v.sno}`;
      let hubSerial = "";
      let siteName = "";
      let harviSerial = `H${v.sno}`;
      try {
        const client = (this.homey.app as MyEnergiApp).clients[v.myenergiClientId as string];
        const { siteNameResult, harviNameResult } = await this.getDeviceAndSiteName(client, v.sno);
        hubSerial = Object.keys(siteNameResult)[0];
        siteName = Object.values(siteNameResult)[0][0].val;
        harviSerial = harviNameResult ? harviNameResult[0]?.key : v.sno;
        deviceName = harviNameResult ? harviNameResult[0].val : deviceName;
      } catch (error) {
        this.error(error);
      }
      this.log(`Found: ${deviceName}`)
      return {
        name: deviceName,
        data: { id: v.sno },
        icon: 'icon.svg', // relative to: /drivers/<driver_id>/assets/
        store: {
          myenergiClientId: v.myenergiClientId,
        },
        capabilities: this.capabilities,
        capabilitiesOptions: {
        },
        settings: {
          hubSerial: hubSerial,
          siteName: siteName,
          harviSerial: harviSerial,
        },
      } as PairDevice;
    })).catch(this.error) as PairDevice[];
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  public async onPairListDevices() {
    if (!(this.homey.app as MyEnergiApp).clients || Object.keys((this.homey.app as MyEnergiApp).clients).length < 1)
      throw new Error("Can not find any myenergi hubs. Please add the hub credentials under myenergi app settings.");

    try {
      const devs = await this.getHarviDevices();
      return devs ? devs : [];
    } catch (error) {
      throw new Error(`An error occurred while trying to fetch devices. Please check your credentials in the app settings. (${JSON.stringify(error)})`);
    }
  }

}

module.exports = HarviDriver;
