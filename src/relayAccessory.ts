import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { arcLevelToPercentage, percentageToArcLevel, ZenColour } from 'zencontrol-tpi-node'
import { ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

export class ZencontrolRelayPlatformAccessory implements ZencontrolTPIPlatformAccessory {
	private service: Service

	private knownOn = false
	private requestOn?: boolean

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')

		this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch)
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		// https://developers.homebridge.io/#/service/Switch

		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this))
			.onGet(this.getOn.bind(this))
	}

	get displayName() {
		return this.accessory.displayName
	}

	/**
	 * Handle "SET" requests from HomeKit
	 * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
	 */
	async setOn(value: CharacteristicValue) {
		const on = value as boolean
		this.platform.log.debug(`Set ${this.accessory.displayName} (${this.accessory.context.address}) to ${on ? 'on' : 'off'}`)

		this.requestOn = !!on

		try {
			await this.platform.sendArcLevel(this.accessory.context.address, this.requestOn ? 254 : 0, false)
		} catch (error) {
			this.platform.log.warn(`Failed to update on/off state for ${this.accessory.displayName}`, error)
		}
	}

	async getOn(): Promise<CharacteristicValue> {
		return this.knownOn
	}

	async receiveArcLevel(arcLevel: number) {
		if (arcLevel === 255) {
			/* A stop fade; ignore */
			return
		}

		const on = arcLevel > 0

		if (on !== this.knownOn) {
			this.platform.log.debug(`Controller updated ${this.accessory.displayName} on/off to ${on ? 'on' : 'off'}`)
			this.knownOn = on
			this.service.updateCharacteristic(this.platform.Characteristic.On, on)
		}
	}

}
