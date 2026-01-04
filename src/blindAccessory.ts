import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

export class ZencontrolBlindPlatformAccessory implements ZencontrolTPIPlatformAccessory {
	private service: Service

	private currentPosition = 0 /* 0 = open, 100 = closed */
	private targetPosition?: number

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')

		this.service = this.accessory.getService(this.platform.Service.WindowCovering) || this.accessory.addService(this.platform.Service.WindowCovering)
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		// https://developers.homebridge.io/#/service/WindowCovering

		this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
			.onGet(this.getCurrentPosition.bind(this))
		this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
			.onGet(this.getTargetPosition.bind(this))
			.onSet(this.setTargetPosition.bind(this))
		this.service.getCharacteristic(this.platform.Characteristic.PositionState)
			.onGet(this.getPositionState.bind(this))
	}

	get displayName() {
		return this.accessory.displayName
	}

	async getCurrentPosition(): Promise<CharacteristicValue> {
		return this.currentPosition
	}

	async getTargetPosition(): Promise<CharacteristicValue> {
		return this.targetPosition ?? 0
	}

	async setTargetPosition(value: CharacteristicValue) {
		const targetPosition = value as number
		this.platform.log.debug(`Set blind ${this.accessory.displayName} (${this.accessory.context.address}) to ${targetPosition}`)

		this.targetPosition = targetPosition

		try {
			await this.platform.sendArcLevel(this.accessory.context.address, this.targetPosition ? 254 : 0, false)
		} catch (error) {
			this.platform.log.warn(`Failed to update state for ${this.accessory.displayName}`, error)
		}
	}

	async getPositionState(): Promise<CharacteristicValue> {
		return this.platform.Characteristic.PositionState.STOPPED
	}

	async receiveArcLevel(arcLevel: number) {
		if (arcLevel === 255) {
			/* A stop fade; ignore */
			return
		}

		const value = arcLevel > 0 ? 100 : 0

		if (value !== this.currentPosition) {
			this.platform.log.debug(`Controller updated blind ${this.accessory.displayName} to ${value}`)
			this.currentPosition = value
			this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, value)
		}
	}

}
