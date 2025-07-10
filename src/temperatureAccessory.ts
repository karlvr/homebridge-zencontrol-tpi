import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

export class ZencontrolTemperaturePlatformAccessory implements ZencontrolTPIPlatformAccessory {
	private service: Service

	private knownTemperature: number | null = null

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')

		this.service = this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor)

		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
			.onGet(this.getCurrentTemperature.bind(this))
	}

	get displayName() {
		return this.accessory.displayName
	}

	async getCurrentTemperature(): Promise<CharacteristicValue | null> {
		return this.knownTemperature
	}

	async receiveTemperature(temperature: number | null) {
		this.knownTemperature = temperature

		this.platform.log(`Received temperature for ${this.displayName}: ${temperature}`)

		this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temperature)
	}

}
