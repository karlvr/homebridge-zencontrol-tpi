import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

export class ZencontrolFanPlatformAccessory implements ZencontrolTPIPlatformAccessory {
	private service: Service

	private knownOn = false
	private requestOn?: boolean

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		this.platform.setupAccessoryInformation(accessory)

		this.service = this.accessory.getService(this.platform.Service.Fan) || this.accessory.addService(this.platform.Service.Fan)
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		// https://developers.homebridge.io/#/service/Fan

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
		this.platform.log.debug(`Set fan ${this.accessory.displayName} (${this.accessory.context.address}) to ${on ? 'on' : 'off'}`)

		this.requestOn = !!on

		try {
			if (this.requestOn) {
				await this.platform.sendRecallMax(this.accessory.context.address)
			} else {
				await this.platform.sendOff(this.accessory.context.address)
			}
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
			this.platform.log.debug(`Controller updated fan ${this.accessory.displayName} on/off to ${on ? 'on' : 'off'}`)
			this.knownOn = on
			this.service.updateCharacteristic(this.platform.Characteristic.On, on)
		}
	}

}
