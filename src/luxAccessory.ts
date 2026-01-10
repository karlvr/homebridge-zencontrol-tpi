import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZencontrolSystemVariableAccessory, ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

export class ZencontrolLuxPlatformAccessory implements ZencontrolTPIPlatformAccessory, ZencontrolSystemVariableAccessory {
	private service: Service

	private knownLux: number | null = null

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')

		// https://developers.homebridge.io/#/service/LightSensor
		this.service = this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor)

		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
			.onGet(this.getCurrentLightLevel.bind(this))
			.setProps({
				minValue: 0,
			})
	}

	get displayName() {
		return this.accessory.displayName
	}

	async getCurrentLightLevel(): Promise<CharacteristicValue | null> {
		return this.knownLux
	}

	private async receiveLux(lux: number | null) {
		this.knownLux = lux

		this.platform.log(`Received lux for ${this.displayName}: ${lux}`)

		this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, lux)
	}

	async receiveSystemVariableChange(systemVariableAddress: string, value: number | null): Promise<void> {
		this.receiveLux(value)
	}

}
