import type { CharacteristicValue, PlatformAccessory } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import type { ZencontrolTPIPlatformAccessoryContext } from './types.js'
import { ZencontrolSensorAccessory } from './sensorAccessory.js'

/** The system variable value that means the contact is closed; any other value means it is open. */
const CONTACT_CLOSED = 0

/**
 * Handle contact switches represented by a system variable that reports 0 when the contact is
 * closed and any other value when it is open.
 *
 * While the system variable has no value the switch reports a fault and retains the last state it
 * observed, as a contact switch has no meaningful "unknown" state to report to HomeKit. Until a
 * value has been observed at all it reports closed, so it doesn't raise alarms or trigger
 * automations on the strength of a reading we haven't taken.
 */
export class ZencontrolContactPlatformAccessory extends ZencontrolSensorAccessory {

	private faulted = false

	constructor(
		platform: ZencontrolTPIPlatform,
		accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		super(platform, accessory, platform.Service.ContactSensor, platform.Characteristic.ContactSensorState, 'contact')

		this.service.getCharacteristic(platform.Characteristic.StatusFault)
			.onGet(this.getStatusFault.bind(this))

		/* HomeKit rejects a null contact state, so start from closed and flag it as a fault until we observe a value */
		this.knownValue = platform.Characteristic.ContactSensorState.CONTACT_DETECTED
		this.service.updateCharacteristic(platform.Characteristic.ContactSensorState, this.knownValue)
		this.setFaulted(true)
	}

	async getStatusFault(): Promise<CharacteristicValue> {
		return this.faulted
			? this.platform.Characteristic.StatusFault.GENERAL_FAULT
			: this.platform.Characteristic.StatusFault.NO_FAULT
	}

	protected override receiveValue(value: number | null) {
		if (value === null) {
			this.platform.log.debug(`contact: controller: ${this.displayName}: no value, retaining last state`)
			this.setFaulted(true)
			return
		}

		super.receiveValue(value === CONTACT_CLOSED
			? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
			: this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED)
		this.setFaulted(false)
	}

	private setFaulted(faulted: boolean) {
		this.faulted = faulted
		this.service.updateCharacteristic(this.platform.Characteristic.StatusFault, faulted
			? this.platform.Characteristic.StatusFault.GENERAL_FAULT
			: this.platform.Characteristic.StatusFault.NO_FAULT)
	}

}
