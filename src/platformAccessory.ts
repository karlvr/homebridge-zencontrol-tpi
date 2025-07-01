import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { ZencontrolTPIPlatform } from './platform.js'
import { ZenColour, ZenColourType } from 'zencontrol-tpi-node'

export interface ZencontrolLightOptions {
	color?: boolean
}

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
	 * The brightness of the light in range 0-100. Only updated by notification from the controller.
	 */
	private knownBrightness = 0
	private requestBrightness?: number

	/**
	 * The hue of the light in range 0-359.
	 */
	private knownHue = 0
	private requestHue?: number

	/**
	 * The saturation of the light in range 0-100
	 */
	private knownSaturation = 0
	private requestSaturation?: number

	private updateDebounceTimeout?: NodeJS.Timeout

	constructor(
		private readonly platform: ZencontrolTPIPlatform,
		private readonly accessory: PlatformAccessory,
		private readonly options: ZencontrolLightOptions = {},
	) {
		// set accessory information
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')

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

		if (options.color) {
			this.service.getCharacteristic(this.platform.Characteristic.Hue)
				.onSet(this.setHue.bind(this))
				.onGet(this.getHue.bind(this))
			this.service.getCharacteristic(this.platform.Characteristic.Saturation)
				.onSet(this.setSaturation.bind(this))
				.onGet(this.getSaturation.bind(this))
		}

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
				this.requestBrightness = 100
			} else {
				/* We resend the last known brightness in case the light has turned off since we last heard */
				this.requestBrightness = this.knownBrightness
			}
		} else {
			this.requestBrightness = 0
		}

		this.updateState()
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

		this.requestBrightness = brightness

		this.updateState()
	}

	async getBrightness(): Promise<CharacteristicValue> {
		return this.knownBrightness
	}

	async setHue(value: CharacteristicValue) {
		const hue = value as number

		this.requestHue = hue
		this.updateState()
	}

	async getHue(): Promise<CharacteristicValue> {
		return this.knownHue
	}

	async setSaturation(value: CharacteristicValue) {
		const saturation = value as number
		
		this.requestSaturation = saturation
		this.updateState()
	}

	private updateState() {
		clearTimeout(this.updateDebounceTimeout)
		if (!this.options.color) {
			this.updateDebounceTimeout = setTimeout(this.updateBrightness.bind(this), 200)
		} else {
			this.updateDebounceTimeout = setTimeout(this.updateColor.bind(this), 200)
		}
	}

	private async updateBrightness() {
		this.platform.log.info(`Updating brightness to ${this.requestBrightness} for ${this.accessory.displayName}`)
		try {
			await this.platform.sendArcLevel(this.accessory.context.id, Math.floor(this.requestBrightness! / 100 * 254))
		} catch (error) {
			this.platform.log.warn(`Failed to update brightness for ${this.accessory.displayName}`, error)
		}
	}

	private async updateColor() {
		const brightness = this.requestBrightness ?? this.knownBrightness

		const color = this.daliColor()
		this.platform.log.info(`Updating color to ${color} (hue ${this.requestHue ?? this.knownHue}, sat ${this.requestSaturation ?? this.knownSaturation}) and brightness to ${brightness} for ${this.accessory.displayName}`)
		try {
			await this.platform.sendColor(this.accessory.context.id, color, Math.floor(brightness / 100 * 254))
		} catch (error) {
			this.platform.log.warn(`Failed to update color for ${this.accessory.displayName}`, error)
		}
	}

	async getSaturation(): Promise<CharacteristicValue> {
		return this.knownSaturation
	}

	private daliColor(): ZenColour {
		/* Convert HSV to RGBWAF */
		const h = this.requestHue ?? this.knownHue
		const s = (this.requestSaturation ?? this.knownSaturation) / 100
		const v = 1 /* We control the brightness separately, so don't include it in the colour conversion */
		const c = v * s
		const x = c * (1 - Math.abs((h / 60) % 2 - 1))
		const m = v - c

		let r, g, b
		if (h < 60) {
			[r, g, b] = [c, x, 0]
		} else if (h < 120) {
			[r, g, b] = [x, c, 0]
		} else if (h < 180) {
			[r, g, b] = [0, c, x]
		} else if (h < 240) {
			[r, g, b] = [0, x, c]
		} else if (h < 300) {
			[r, g, b] = [x, 0, c]
		} else {
			[r, g, b] = [c, 0, x]
		}

		r += m
		g += m
		b += m

		let w = Math.min(r, g, b)
		r -= w
		g -= w
		b -= w

		const intensity_factor = 0.3

		let a: number
		/* Amber boost for ~20°-50° */
		if (h >= 20 && h <= 50) {
			a = (1 - Math.abs(h - 35) / 15) * intensity_factor
		} else {
			a = 0
		}

		let f: number
		/* Far-Red boost for <30° or >330° */
		if (h >= 330 || h <= 30) {
			const hNorm = h > 330 ? h - 360 : h // bring >330 into negative range
			const dist = Math.abs(hNorm) // distance from 0°/360°
			f = (1 - dist / 30) * intensity_factor
		} else {
			f = 0
		}

		const clamp = (n: number) => Math.max(0, Math.min(1, n))
		r = clamp(r)
		g = clamp(g)
		b = clamp(b)
		w = clamp(w)
		a = clamp(a)
		f = clamp(f)

		r *= 255
		g *= 255
		b *= 255
		w *= 255
		a *= 255
		f *= 255

		r = Math.round(r)
		g = Math.round(g)
		b = Math.round(b)
		w = Math.round(w)
		a = Math.round(a)
		f = Math.round(f)

		this.platform.log.info(`Converted ${this.requestHue || this.knownHue}, ${this.requestSaturation ?? this.knownSaturation} to ${r}, ${g}, ${b}, ${w} (m=${m}, c=${c}, x=${x})`)

		return new ZenColour({
			r,
			g,
			b,
			w,
			a,
			f,
			type: ZenColourType.RGBWAF,
		})
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

	async receiveDaliColor(color: ZenColour) {
		if (color.type === ZenColourType.RGBWAF) {
			let r = (color.r ?? 0) / 255
			let g = (color.g ?? 0) / 255
			let b = (color.b ?? 0) / 255
			const w = (color.w ?? 0) / 255

			r += w
			g += w
			b += w

			r = Math.min(1, r)
			g = Math.min(1, g)
			b = Math.min(1, b)

			const max = Math.max(r, g, b)
			const min = Math.min(r, g, b)
			const delta = max - min

			let h = 0
			if (delta === 0) {
				h = 0
			} else if (max === r) {
				h = 60 * (((g - b) / delta) % 6)
			} else if (max === g) {
				h = 60 * (((b - r) / delta) + 2)
			} else if (max === b) {
				h = 60 * (((r - g) / delta) + 4)
			}

			if (h < 0) {
				h += 360
			}

			let s = max === 0 ? 0 : delta / max
			let v = max

			s *= 100
			v *= 100

			h = Math.round(h)
			s = Math.round(s)
			v = Math.round(v)

			h = Math.min(360, h)
			s = Math.min(100, s)

			this.knownHue = h
			this.knownSaturation = s

			this.service.updateCharacteristic(this.platform.Characteristic.Hue, h)
			this.service.updateCharacteristic(this.platform.Characteristic.Saturation, s)
		}
	}
}
