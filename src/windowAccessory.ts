import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZencontrolSystemVariableAccessory, ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

const WINDOW_OPEN = 100
const WINDOW_CLOSED = 0

const WINDOW_OPENING = 2
const WINDOW_CLOSING = 1

/**
 * Handle windows represented by a control system variable and a position system variable.
 */
export class ZencontrolWindowPlatformAccessory implements ZencontrolTPIPlatformAccessory, ZencontrolSystemVariableAccessory {
	private service: Service

	private currentPosition = WINDOW_OPEN
	private targetPosition?: number
	private positionState = this.platform.Characteristic.PositionState.STOPPED
	private positionStateTimeout?: NodeJS.Timeout
	/** The system variable for the blind position, if any. */
	public positionSystemVariableAddress: string | undefined

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
		public readonly controlSystemVariableAddress: string,
	) {
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')

		this.service = this.accessory.getService(this.platform.Service.Window) || this.accessory.addService(this.platform.Service.Window)
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		// https://developers.homebridge.io/#/service/Window

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
		const targetPosition = (value as number) >= 50 ? WINDOW_OPEN : WINDOW_CLOSED
		this.platform.log.debug(`Set window ${this.accessory.displayName} (${this.accessory.context.address}) to ${targetPosition === WINDOW_OPEN ? 'open' : 'closed'}`)

		this.targetPosition = targetPosition
		if (this.positionStateTimeout) {
			clearTimeout(this.positionStateTimeout)
			this.positionStateTimeout = undefined
		}

		try {
			if (this.targetPosition === WINDOW_CLOSED) {
				this.platform.log.debug(`Updating window position state to decreasing: ${this.accessory.displayName}`)
				this.positionState = this.platform.Characteristic.PositionState.DECREASING
				this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState)

				await this.platform.setSystemVariable(this.controlSystemVariableAddress, WINDOW_CLOSING)
			} else {
				this.platform.log.debug(`Updating window position state to increasing: ${this.accessory.displayName}`)
				this.positionState = this.platform.Characteristic.PositionState.INCREASING
				this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState)

				await this.platform.setSystemVariable(this.controlSystemVariableAddress, WINDOW_OPENING)
			}

			this.positionStateTimeout = setTimeout(() => {
				this.platform.log.debug(`Updating window position state to stopped: ${this.accessory.displayName}`)
				this.positionStateTimeout = undefined
				this.positionState = this.platform.Characteristic.PositionState.STOPPED
				this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState)
			}, 5000)
		} catch (error) {
			this.platform.log.warn(`Failed to control window ${this.accessory.displayName}`, error)
			this.positionState = this.platform.Characteristic.PositionState.STOPPED
			this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState)
		}
	}

	async getPositionState(): Promise<CharacteristicValue> {
		return this.positionState
	}

	private async receiveControl(control: number) {
		if (control < 0 || control > 2) {
			this.platform.log.warn(`Ignoring invalid window control for ${this.accessory.displayName}: ${control}`)
			return
		}

		this.platform.log.debug(`Controller updated window ${this.accessory.displayName} to ${control === 0 ? 'stopped' : control === 1 ? 'closing' : 'opening'}`)

		const position = control === 0 ? -1 : control === 1 ? WINDOW_CLOSED : WINDOW_OPEN
		if (position !== -1 && position !== this.targetPosition) {
			this.targetPosition = position
			this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, position)
		}
	}

	private async receivePosition(position: number) {
		if (position < 0 || position > 100) {
			this.platform.log.warn(`Ignoring invalid window position for ${this.accessory.displayName}: ${position}`)
			return
		}

		this.platform.log.debug(`Controller updated window ${this.accessory.displayName} to position ${position}`)

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

	async receiveSystemVariableChange(systemVariableAddress: string, value: number | null): Promise<void> {
		if (systemVariableAddress === this.controlSystemVariableAddress) {
			if (value !== null) {
				this.receiveControl(value)
			}
		} else if (systemVariableAddress === this.positionSystemVariableAddress) {
			if (value !== null) {
				this.receivePosition(value)
			}
		} else {
			this.platform.log.warn(`Ignoring unknown system variable change in blind "${this.displayName}: ${systemVariableAddress}`)
		}
	}

}
