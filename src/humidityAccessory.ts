import type { PlatformAccessory } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import type { ZencontrolTPIPlatformAccessoryContext } from './types.js'
import { ZencontrolSensorAccessory } from './sensorAccessory.js'

export class ZencontrolHumidityPlatformAccessory extends ZencontrolSensorAccessory {

	constructor(
		platform: ZencontrolTPIPlatform,
		accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		super(platform, accessory, platform.Service.HumiditySensor, platform.Characteristic.CurrentRelativeHumidity, 'humidity')
	}

}
