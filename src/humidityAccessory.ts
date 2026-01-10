import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZencontrolSystemVariableAccessory, ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

export class ZencontrolHumidityPlatformAccessory implements ZencontrolTPIPlatformAccessory, ZencontrolSystemVariableAccessory {
	private service: Service

	private knownHumidity: number | null = null

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')

		this.service = this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor)

		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
			.onGet(this.getCurrentHumidity.bind(this))
	}

	get displayName() {
		return this.accessory.displayName
	}

	async getCurrentHumidity(): Promise<CharacteristicValue | null> {
		return this.knownHumidity
	}

	private async receiveHumidity(humidity: number | null) {
		this.knownHumidity = humidity

		this.platform.log(`Received humidity for ${this.displayName}: ${humidity}`)

		this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, humidity)
	}

	async receiveSystemVariableChange(systemVariableAddress: string, value: number | null): Promise<void> {
		await this.receiveHumidity(value)
	}

}
