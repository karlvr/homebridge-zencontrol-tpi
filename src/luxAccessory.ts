import type { PlatformAccessory } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import type { ZencontrolTPIPlatformAccessoryContext } from './types.js'
import { ZencontrolSensorAccessory } from './sensorAccessory.js'

export class ZencontrolLuxPlatformAccessory extends ZencontrolSensorAccessory {

	constructor(
		platform: ZencontrolTPIPlatform,
		accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		super(platform, accessory, platform.Service.LightSensor, platform.Characteristic.CurrentAmbientLightLevel, 'lux')

		this.service.getCharacteristic(platform.Characteristic.CurrentAmbientLightLevel)
			.setProps({
				minValue: 0,
			})
	}

}
