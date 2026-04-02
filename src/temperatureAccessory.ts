import type { PlatformAccessory } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import type { ZencontrolTPIPlatformAccessoryContext } from './types.js'
import { ZencontrolSensorAccessory } from './sensorAccessory.js'

export class ZencontrolTemperaturePlatformAccessory extends ZencontrolSensorAccessory {

	private hasWarnedScaling = false

	constructor(
		platform: ZencontrolTPIPlatform,
		accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		super(platform, accessory, platform.Service.TemperatureSensor, platform.Characteristic.CurrentTemperature, 'temperature')
	}

	protected override receiveValue(value: number | null) {
		/* We are receiving notifications that have magnitude 0 but are 10 times too big */
		if (value !== null && value > 100) {
			const original = value
			while (value > 100) {
				value /= 10
			}
			if (!this.hasWarnedScaling) {
				this.platform.log.warn(`Received out-of-range temperature for ${this.displayName}: ${original}, scaled to ${value}`)
				this.hasWarnedScaling = true
			}
		}

		super.receiveValue(value)
	}

}
