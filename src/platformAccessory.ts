import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZenAddress } from 'zencontrol-tpi-node'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ZencontrolTPIPlatformAccessory {
	private service: Service

	/**
	 * Whether the light is on/off. Only updated by notification from the controller.
	 */
	private knownOn = false

	/**
	 * The brightness of the group. Only updated by notification from the controller.
	 */
	private knownBrightness = 0

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory,
	) {
		// set accessory information
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, 'Group')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.groupId)

		// get the LightBulb service if it exists, otherwise create a new LightBulb service
		// you can create multiple services for each accessory

		this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb)

		// set the service name, this is what is displayed as the default name on the Home app
		// in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName)

		// each service must implement at-minimum the "required characteristics" for the given service type
		// see https://developers.homebridge.io/#/service/Lightbulb

		// register handlers for the On/Off Characteristic
		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this)) // SET - bind to the `setOn` method below
			.onGet(this.getOn.bind(this)) // GET - bind to the `getOn` method below

		// register handlers for the Brightness Characteristic
		this.service.getCharacteristic(this.platform.Characteristic.Brightness)
			.onSet(this.setBrightness.bind(this)) // SET - bind to the `setBrightness` method below
			.onGet(this.getBrightness.bind(this))

		/**
		 * Creating multiple services of the same type.
		 *
		 * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
		 * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
		 * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
		 *
		 * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
		 * can use the same subtype id.)
		 */

		// Example: add two "motion sensor" services to the accessory
		// const motionSensorOneService = this.accessory.getService('Motion Sensor One Name')
		// 	|| this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1')

		// const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name')
		// 	|| this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2')

		/**
		 * Updating characteristics values asynchronously.
		 *
		 * Example showing how to update the state of a Characteristic asynchronously instead
		 * of using the `on('get')` handlers.
		 * Here we change update the motion sensor trigger states on and off every 10 seconds
		 * the `updateCharacteristic` method.
		 *
		 */
		// let motionDetected = false
		// setInterval(() => {
		// 	// EXAMPLE - inverse the trigger
		// 	motionDetected = !motionDetected

		// 	// push the new value to HomeKit
		// 	motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected)
		// 	motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected)

		// 	this.platform.log.debug('Triggering motionSensorOneService:', motionDetected)
		// 	this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected)
		// }, 10000)
	}

	/**
	 * Handle "SET" requests from HomeKit
	 * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
	 */
	async setOn(value: CharacteristicValue) {
		const on = value as boolean
		this.platform.log.debug(`Set ${this.accessory.displayName} to ${on ? 'on' : 'off'}`)

		if (on) {
			if (this.knownBrightness <= 0) {
				await this.sendBrightnessCommand(100)
			} else {
				/* We resend the last known brightness in case the group has turned off since we last heard */
				await this.sendBrightnessCommand(this.knownBrightness)
			}
		} else {
			await this.sendBrightnessCommand(0)
		}
	}

	/**
	 * Handle the "GET" requests from HomeKit
	 * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
	 *
	 * GET requests should return as fast as possible. A long delay here will result in
	 * HomeKit being unresponsive and a bad user experience in general.
	 *
	 * If your device takes time to respond you should update the status of your device
	 * asynchronously instead using the `updateCharacteristic` method instead.
	 * In this case, you may decide not to implement `onGet` handlers, which may speed up
	 * the responsiveness of your device in the Home app.
  
	 * @example
	 * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
	 */
	async getOn(): Promise<CharacteristicValue> {
		// this.platform.log.debug(`Get on/off of ${this.accessory.displayName}: ${this.on}`)

		return this.knownOn
	}

	/**
	 * Handle "SET" requests from HomeKit
	 * These are sent when the user changes the state of an accessory, for example, changing the Brightness
	 */
	async setBrightness(value: CharacteristicValue) {
		const brightness = value as number
		this.platform.log.debug(`Set ${this.accessory.displayName} brightness to ${brightness}`)

		await this.sendBrightnessCommand(brightness, true)
	}

	async getBrightness(): Promise<CharacteristicValue> {
		return this.knownBrightness
	}

	async sendBrightnessCommand(brightness: number, instant = false) {
		try {
			this.platform.sendGroupArcLevel(this.accessory.context.groupId, Math.floor(brightness / 100 * 254), instant)
		} catch (error) {
			this.platform.log.warn(`Failed to set group arc level: ${error}`)
		}
	}

	async receiveDaliBrightness(daliArcLevel: number) {
		const brightness = Math.floor(daliArcLevel / 254 * 100)
		const on = daliArcLevel > 0

		if (brightness !== this.knownBrightness) {
			this.platform.log.debug(`Controller updated ${this.accessory.displayName} brightness to ${brightness}`)
			this.knownBrightness = brightness
			this.service.updateCharacteristic(this.platform.Characteristic.Brightness, brightness)
		}
		if (on !== this.knownOn) {
			this.platform.log.debug(`Controller updated ${this.accessory.displayName} on/off to ${on ? 'on' : 'off'}`)
			this.knownOn = on
			this.service.updateCharacteristic(this.platform.Characteristic.On, on)
		}
	}
}
