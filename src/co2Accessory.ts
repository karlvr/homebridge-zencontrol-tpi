import type { CharacteristicValue, PlatformAccessory } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import type { ZencontrolTPIPlatformAccessoryContext } from './types.js'
import { ZencontrolSensorAccessory } from './sensorAccessory.js'

export class ZencontrolCO2PlatformAccessory extends ZencontrolSensorAccessory {

	constructor(
		platform: ZencontrolTPIPlatform,
		accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
	) {
		super(platform, accessory, platform.Service.CarbonDioxideSensor, platform.Characteristic.CarbonDioxideLevel, 'CO2')

		this.service.getCharacteristic(platform.Characteristic.CarbonDioxideDetected)
			.onGet(this.getCO2Detected.bind(this))
	}

	async getCO2Detected(): Promise<CharacteristicValue> {
		if (this.knownValue !== null && this.platform.config.co2AbnormalLevel && this.knownValue >= this.platform.config.co2AbnormalLevel) {
			return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
		} else {
			return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
		}
	}

	protected override receiveValue(value: number | null) {
		super.receiveValue(value)

		if (value !== null && this.platform.config.co2AbnormalLevel && value >= this.platform.config.co2AbnormalLevel) {
			this.service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL)
		} else {
			this.service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL)
		}
	}

}
