import type { Characteristic, CharacteristicValue, PlatformAccessory, Service, WithUUID } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import type { ZencontrolSystemVariableAccessory, ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'

export class ZencontrolSensorAccessory implements ZencontrolTPIPlatformAccessory, ZencontrolSystemVariableAccessory {
	protected service: Service
	protected knownValue: number | null = null
	private readonly valueCharacteristic: WithUUID<{ new(): Characteristic }>

	constructor(
		protected readonly platform: ZencontrolTPIPlatform,
		protected readonly accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>,
		serviceConstructor: WithUUID<typeof Service>,
		valueCharacteristic: WithUUID<{ new(): Characteristic }>,
		private readonly sensorLabel: string,
	) {
		this.valueCharacteristic = valueCharacteristic

		platform.setupAccessoryInformation(accessory)

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.service = accessory.getService(serviceConstructor) || accessory.addService(serviceConstructor as any)
		this.service.setCharacteristic(platform.Characteristic.Name, accessory.displayName)

		this.service.getCharacteristic(valueCharacteristic)
			.onGet(this.getValue.bind(this))
	}

	get displayName() {
		return this.accessory.displayName
	}

	async getValue(): Promise<CharacteristicValue | null> {
		return this.knownValue
	}

	protected receiveValue(value: number | null) {
		this.knownValue = value
		this.platform.log(`Received ${this.sensorLabel} for ${this.displayName}: ${value}`)
		this.service.updateCharacteristic(this.valueCharacteristic, value)
	}

	async receiveSystemVariableChange(_systemVariableAddress: string, value: number | null): Promise<void> {
		this.receiveValue(value)
	}
}
