import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

const BLIND_OPEN = 100
const BLIND_CLOSED = 0

export class ZencontrolBlindPlatformAccessory implements ZencontrolTPIPlatformAccessory {
	private service: Service

	private currentPosition = BLIND_OPEN
	private targetPosition?: number
	private positionState = this.platform.Characteristic.PositionState.STOPPED
	private positionStateTimeout?: NodeJS.Timeout
	/** Whether this blind has a system variable associated to report whether it's open or closed. */
	public hasSystemVariable = false

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
		const targetPosition = (value as number) >= 50 ? BLIND_OPEN : BLIND_CLOSED
		this.platform.log.debug(`Set blind ${this.accessory.displayName} (${this.accessory.context.address}) to ${targetPosition === BLIND_OPEN ? 'open' : 'closed'}`)

		this.targetPosition = targetPosition
		if (this.positionStateTimeout) {
			clearTimeout(this.positionStateTimeout)
			this.positionStateTimeout = undefined
		}

		try {
			if (this.targetPosition === BLIND_CLOSED) {
				this.platform.log.debug(`Updating blind position state to decreasing: ${this.accessory.displayName}`)
				this.positionState = this.platform.Characteristic.PositionState.DECREASING
				this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState)
				await this.platform.sendRecallMax(this.accessory.context.address)
			} else {
				this.platform.log.debug(`Updating blind position state to increasing: ${this.accessory.displayName}`)
				this.positionState = this.platform.Characteristic.PositionState.INCREASING
				this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState)
				if (this.hasSystemVariable) {
					await this.platform.sendRecallMin(this.accessory.context.address)
				} else {
					await this.platform.sendOff(this.accessory.context.address)
				}
			}

			this.positionStateTimeout = setTimeout(() => {
				this.platform.log.debug(`Updating blind position state to stopped: ${this.accessory.displayName}`)
				this.positionStateTimeout = undefined
				this.positionState = this.platform.Characteristic.PositionState.STOPPED
				this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState)
			}, 5000)
		} catch (error) {
			this.platform.log.warn(`Failed to control blind ${this.accessory.displayName}`, error)
			this.positionState = this.platform.Characteristic.PositionState.STOPPED
			this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState)
		}
	}

	async getPositionState(): Promise<CharacteristicValue> {
		return this.positionState
	}

	/* NB: blind controllers change back to 0 after a while, so they inaccurately report that they're open; this is why we prefer the system variable. */
	async receiveArcLevel(arcLevel: number) {
		if (this.hasSystemVariable) {
			this.platform.log.debug(`Controller updated blind ${this.accessory.displayName} to arc level ${arcLevel}; ignoring as there is a system variable configured`)
			return
		}

		const value = arcLevel > 0 ? BLIND_CLOSED : BLIND_OPEN
		this.platform.log.debug(`Controller updated blind ${this.accessory.displayName} to ${value === BLIND_OPEN ? 'open' : 'closed'}`)

		if (value !== this.currentPosition) {
			this.currentPosition = value
			this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, value)
		}

		/* Update target position otherwise HomeKit will observe the difference between current and target and think the blind is moving */
		if (value !== this.targetPosition) {
			this.targetPosition = value
			this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, value)
		}
	}

	async receivePosition(position: number) {
		if (position < 0 || position > 100) {
			/* Invalid; ignore */
			return
		}

		this.platform.log.debug(`Controller updated blind ${this.accessory.displayName} to position ${position}`)
		if (position !== this.currentPosition) {
			this.currentPosition = position
			this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, position)
		}

		/* Update target position otherwise HomeKit will observe the difference between current and target and think the blind is moving */
		if (position !== this.targetPosition) {
			this.targetPosition = position
			this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, position)
		}
	}

}
