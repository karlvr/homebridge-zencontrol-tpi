import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZencontrolSystemVariableAccessory, ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

export class ZencontrolCO2PlatformAccessory implements ZencontrolTPIPlatformAccessory, ZencontrolSystemVariableAccessory {
	private service: Service

	private knownCO2: number | null = null

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')

		// https://developers.homebridge.io/#/service/CarbonDioxideSensor
		this.service = this.accessory.getService(this.platform.Service.CarbonDioxideSensor) || this.accessory.addService(this.platform.Service.CarbonDioxideSensor)

		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		this.service.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected)
			.onGet(this.getCO2Detected.bind(this))
		this.service.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
			.onGet(this.getCurrentCO2Level.bind(this))
	}

	get displayName() {
		return this.accessory.displayName
	}

	async getCO2Detected(): Promise<CharacteristicValue | null> {
		if (this.knownCO2 !== null && this.platform.config.co2AbnormalLevel && this.knownCO2 >= this.platform.config.co2AbnormalLevel) {
			return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
		} else {
			return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
		}
	}

	async getCurrentCO2Level(): Promise<CharacteristicValue | null> {
		return this.knownCO2
	}

	private async receiveCO2(co2: number | null) {
		this.knownCO2 = co2

		this.platform.log(`Received CO2 for ${this.displayName}: ${co2}`)

		this.service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, co2)
	}

	async receiveSystemVariableChange(systemVariableAddress: string, value: number | null): Promise<void> {
		await this.receiveCO2(value)
	}

}
