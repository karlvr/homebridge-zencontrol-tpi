import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge'

import { ZencontrolLightOptions, ZencontrolLightPlatformAccessory } from './lightAccessory.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { MyPluginConfig, ZencontrolTPIPlatformAccessory } from './types.js'
import { ZenController, ZenProtocol, ZenAddress, ZenAddressType, ZenControlGearType, ZenColour, ZenConst } from 'zencontrol-tpi-node'
import { ZencontrolTemperaturePlatformAccessory } from './temperatureAccessory.js'
import { ZencontrolHumidityPlatformAccessory } from './humidityAccessory.js'

interface ZencontrolTPIPlatformAccessoryOptions {
	id: string
	label: string
	model: string
	serial: string
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ZencontrolTPIPlatform implements DynamicPlatformPlugin {
	public readonly Service: typeof Service
	public readonly Characteristic: typeof Characteristic

	// this is used to track restored cached accessories
	public readonly accessories: Map<string, PlatformAccessory> = new Map()
	public readonly discoveredCacheUUIDs: string[] = []

	private zc: ZenProtocol
	private accessoryMap = new Map<string, ZencontrolTPIPlatformAccessory>()
	private accessoryNeedsUpdate: PlatformAccessory[] = []
	private lastSentDAPC = new Map<string, number>()

	constructor(
		public readonly log: Logging,
		public readonly config: MyPluginConfig,
		public readonly api: API,
	) {
		this.Service = api.hap.Service
		this.Characteristic = api.hap.Characteristic

		const debug = !!config.debug

		this.log = !debug
			? log
			: Object.assign(log, { debug: (message: string, ...parameters: unknown[]) => {
				log.info(`DEBUG: ${message}`, ...parameters) 
			} })

		const controllers: ZenController[] = []
		for (const controllerConfig of config.controllers || []) {
			if (controllerConfig.id !== undefined && controllerConfig.address && controllerConfig.macAddress) {
				controllers.push(new ZenController({
					id: controllerConfig.id,
					host: controllerConfig.address,
					port: controllerConfig.port,
					macAddress: controllerConfig.macAddress,
				}))
			}
		}

		this.log.info(`Loaded ${controllers.length} valid controllers`)

		const zc = new ZenProtocol({
			controllers,
			logger: this.log,
		})
		this.zc = zc

		this.log.debug('Finished initializing platform:', this.config.name)

		// When this event is fired it means Homebridge has restored all cached accessories from disk.
		// Dynamic Platform plugins should only register new accessories after this event was fired,
		// in order to ensure they weren't added to homebridge already. This event can also be used
		// to start discovery of new accessories.
		this.api.on('didFinishLaunching', () => {
			log.debug('Executed didFinishLaunching callback')
			// run the method to discover / register your devices as accessories
			this.discoverDevices()
		})
	}

	/**
	 * This function is invoked when homebridge restores cached accessories from disk at startup.
	 * It should be used to set up event handlers for characteristics and update respective values.
	 */
	configureAccessory(accessory: PlatformAccessory) {
		this.log.info('Loading accessory from cache:', accessory.displayName)

		// add the restored accessory to the accessories cache, so we can track if it has already been registered
		this.accessories.set(accessory.UUID, accessory)
	}

	/**
	 * This is an example method showing how to register discovered accessories.
	 * Accessories must only be registered once, previously created accessories
	 * must not be registered again to prevent "duplicate UUID" errors.
	 */
	async discoverDevices() {
		this.log.info('Discovering groups')
		this.accessoryMap.clear()

		const promises: Promise<unknown>[] = []
		for (const controller of this.zc.controllers) {
			/* Discover groups */
			promises.push(this.zc.queryGroupNumbers(controller).then((groups) => {
				const promises: Promise<unknown>[] = []
				for (const group of groups) {
					promises.push(this.zc.queryGroupLabel(group).then(async (label) => {
						if (label === null) {
							/* We treat these as not existing */
							return
						}
						const groupId = addressToAccessoryId(group)

						const acc = this.addLightAccessory({ id: groupId, label, model: 'Group', serial: `${group.controller.id}.${group.group()}` })
						const groupStatus = await this.zc.queryGroupByNumber(group)
						if (groupStatus) {
							acc.receiveDaliBrightness(groupStatus.level)
						}
					}))
				}

				return Promise.all(promises)
			}))

			/* Discover ECGs that aren't in groups */
			promises.push(this.zc.queryControlGearDaliAddresses(controller).then((ecgs) => {
				const promises: Promise<unknown>[] = []
				for (const ecg of ecgs) {
					promises.push(this.zc.queryGroupMembershipByAddress(ecg).then(async groups => {
						if (groups.length === 0) {
							/* Found an ECG that's not part of a group */
							const types = await this.zc.daliQueryCgType(ecg)
							if (!types) {
								return
							}

							if (types.find(isLightControlGear)) {
								const label = await this.zc.queryDaliDeviceLabel(ecg)
								if (!label) {
									return
								}

								const color = !!types.find(isColorControlGear)
								const acc = this.addLightAccessory({ id: addressToAccessoryId(ecg), label, model: 'ECG', serial: `${controller.id}.${ecg.ecg()}`, color })
								const level = await this.zc.daliQueryLevel(ecg)
								if (level !== null) {
									acc.receiveDaliBrightness(level)
								}
							}
						}
					}))
				}
				return Promise.all(promises)
			}))

			for (let variable = 0; variable < ZenConst.MAX_SYSVAR; variable++) {
				promises.push(this.zc.querySystemVariableName(controller, variable).then(async label => {
					if (label && label.toLocaleLowerCase().indexOf('temperature') !== -1) {
						let value = await this.zc.querySystemVariable(controller, variable)

						/* This API doesn't respect magnitude so we have to guess */
						if (value !== null) {
							while (value > 100) {
								value /= 10
							}
						}

						const acc = this.addTemperatureAccessory({ id: systemVariableToAccessoryId(controller, variable), label, model: 'System Variable', serial: `SV ${controller.id}.${variable}` })
						acc.receiveTemperature(value)
					} else if (label && label.toLocaleLowerCase().indexOf('humidity') !== -1) {
						const value = await this.zc.querySystemVariable(controller, variable)

						const acc = this.addHumidityAccessory({ id: systemVariableToAccessoryId(controller, variable), label, model: 'System Variable', serial: `SV ${controller.id}.${variable}` })
						acc.receiveHumidity(value)
					}
				}))
			}
		}

		try {
		await Promise.all(promises)
		} catch (error) {
			this.log.error('Failed to discover devices', error)

			/* Return so we don't remove accessories, as then the user will have to set them all up again! Adding them to rooms etc */
			return
		}

		if (this.accessoryNeedsUpdate.length) {
			this.api.updatePlatformAccessories(this.accessoryNeedsUpdate)
			this.accessoryNeedsUpdate.splice(0, this.accessoryNeedsUpdate.length)
		}

		// you can also deal with accessories from the cache which are no longer present by removing them from Homebridge
		// for example, if your plugin logs into a cloud account to retrieve a device list, and a user has previously removed a device
		// from this cloud account, then this device will no longer be present in the device list but will still be in the Homebridge cache
		for (const [uuid, accessory] of this.accessories) {
			if (!this.discoveredCacheUUIDs.includes(uuid)) {
				this.log.info('Removing existing accessory from cache:', accessory.displayName)
				this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
			}
		}

		this.log.info('Device discovery complete')
		this.activateLiveEvents()
	}

	private addLightAccessory({ id, label, model, serial, ...options }: ZencontrolTPIPlatformAccessoryOptions & ZencontrolLightOptions): ZencontrolLightPlatformAccessory {
		// generate a unique id for the accessory this should be generated from
		// something globally unique, but constant, for example, the device serial
		// number or MAC address
		const uuid = this.api.hap.uuid.generate(id)

		// see if an accessory with the same uuid has already been registered and restored from
		// the cached devices we stored in the `configureAccessory` method above
		const existingAccessory = this.accessories.get(uuid)

		let acc: ZencontrolLightPlatformAccessory
		if (existingAccessory) {
			// the accessory already exists
			this.log.info('Restoring existing light accessory from cache:', existingAccessory.displayName)

			this.updateAccessory(existingAccessory, { id, label, model, serial })

			// create the accessory handler for the restored accessory
			// this is imported from `platformAccessory.ts`
			acc = new ZencontrolLightPlatformAccessory(this, existingAccessory, options)
			this.accessoryMap.set(id, acc)

			// it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
			// remove platform accessories when no longer present
			// this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
			// this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
		} else {
			// the accessory does not yet exist, so we need to create it
			this.log.info(`Adding new ${model} light accessory:`, label)

			// create a new accessory
			const accessory = new this.api.platformAccessory(label, uuid)

			// store a copy of the device object in the `accessory.context`
			// the `context` property can be used to store any data about the accessory you may need
			accessory.context.model = model
			accessory.context.serial = serial
			accessory.context.id = id

			// create the accessory handler for the newly create accessory
			// this is imported from `platformAccessory.ts`
			acc = new ZencontrolLightPlatformAccessory(this, accessory, options)
			this.accessoryMap.set(id, acc)

			// link the accessory to your platform
			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])

			const nameCharacteristic = accessory.getService(this.Service.AccessoryInformation)!
				.getCharacteristic(this.Characteristic.Name)
			nameCharacteristic.updateValue(label)
		}

		// push into discoveredCacheUUIDs
		this.discoveredCacheUUIDs.push(uuid)
		return acc
	}

	private addTemperatureAccessory({ id, label, model, serial }: ZencontrolTPIPlatformAccessoryOptions): ZencontrolTemperaturePlatformAccessory {
		const uuid = this.api.hap.uuid.generate(id)
		const existingAccessory = this.accessories.get(uuid)

		let acc: ZencontrolTemperaturePlatformAccessory
		if (existingAccessory) {
			this.log.info('Restoring existing temperature accessory from cache:', existingAccessory.displayName)

			this.updateAccessory(existingAccessory, { id, label, model, serial })

			acc = new ZencontrolTemperaturePlatformAccessory(this, existingAccessory)
			this.accessoryMap.set(id, acc)
		} else {
			this.log.info(`Adding new ${model} temperature accessory:`, label)

			const accessory = new this.api.platformAccessory(label, uuid)

			accessory.context.model = model
			accessory.context.serial = serial
			accessory.context.id = id

			acc = new ZencontrolTemperaturePlatformAccessory(this, accessory)
			this.accessoryMap.set(id, acc)

			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])

			const nameCharacteristic = accessory.getService(this.Service.AccessoryInformation)!
				.getCharacteristic(this.Characteristic.Name)
			nameCharacteristic.updateValue(label)
		}

		this.discoveredCacheUUIDs.push(uuid)
		return acc
	}
	
	private addHumidityAccessory({ id, label, model, serial }: ZencontrolTPIPlatformAccessoryOptions): ZencontrolHumidityPlatformAccessory {
		const uuid = this.api.hap.uuid.generate(id)
		const existingAccessory = this.accessories.get(uuid)

		let acc: ZencontrolHumidityPlatformAccessory
		if (existingAccessory) {
			this.log.info('Restoring existing humidity accessory from cache:', existingAccessory.displayName)

			this.updateAccessory(existingAccessory, { id, label, model, serial })

			acc = new ZencontrolHumidityPlatformAccessory(this, existingAccessory)
			this.accessoryMap.set(id, acc)
		} else {
			this.log.info(`Adding new ${model} humidity accessory:`, label)

			const accessory = new this.api.platformAccessory(label, uuid)

			accessory.context.model = model
			accessory.context.serial = serial
			accessory.context.id = id

			acc = new ZencontrolHumidityPlatformAccessory(this, accessory)
			this.accessoryMap.set(id, acc)

			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])

			const nameCharacteristic = accessory.getService(this.Service.AccessoryInformation)!
				.getCharacteristic(this.Characteristic.Name)
			nameCharacteristic.updateValue(label)
		}

		this.discoveredCacheUUIDs.push(uuid)
		return acc
	}

	private updateAccessory(existingAccessory: PlatformAccessory, { id, label, model, serial }: ZencontrolTPIPlatformAccessoryOptions): boolean {
		const currentDisplayName = existingAccessory.displayName
		if (currentDisplayName !== label) {
			this.log.info(`Updating existing ${model} accessory display name:`, label, `(from ${currentDisplayName})`)
			existingAccessory.updateDisplayName(label)

			const nameCharacteristic = existingAccessory.getService(this.Service.AccessoryInformation)!
				.getCharacteristic(this.Characteristic.Name)
			nameCharacteristic.updateValue(label)
		}

		// if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
		// this.api.updatePlatformAccessories([existingAccessory])
		let needsUpdate = false
		if (existingAccessory.context.model !== model) {
			existingAccessory.context.model = model
			needsUpdate = true
		}
		if (existingAccessory.context.serial !== serial) {
			existingAccessory.context.serial = serial
			needsUpdate = true
		}
		if (existingAccessory.context.id !== id) {
			existingAccessory.context.id = id
			needsUpdate = true
		}

		if (needsUpdate) {
			this.log.info(`Updating existing ${model} acccessory context: ${existingAccessory.displayName}`)
			this.accessoryNeedsUpdate.push(existingAccessory)
		}
		return needsUpdate
	}

	private async activateLiveEvents() {
		this.log.info('Starting live event monitoring')
		this.zc.startEventMonitoring()

		this.zc.groupLevelChangeCallback = (address, arcLevel) => {
			const accessoryId = addressToAccessoryId(address)
			const acc = this.accessoryMap.get(accessoryId)
			if (acc instanceof ZencontrolLightPlatformAccessory) {
				acc.receiveDaliBrightness(arcLevel).catch((reason) => {
					this.log.warn(`Failed to update group accessory "${acc.displayName}" brightness: ${reason}`)
				})
			}
		}
		
		this.zc.levelChangeCallback = (address, arcLevel) => {
			const accessoryId = addressToAccessoryId(address)
			const acc = this.accessoryMap.get(accessoryId)
			if (acc instanceof ZencontrolLightPlatformAccessory) {
				acc.receiveDaliBrightness(arcLevel).catch((reason) => {
					this.log.warn(`Failed to update ECG accessory "${acc.displayName}" brightness: ${reason}`)
				})
			}
		}

		this.zc.colourChangeCallback = (address, color) => {
			const accessoryId = addressToAccessoryId(address)
			const acc = this.accessoryMap.get(accessoryId)
			if (acc instanceof ZencontrolLightPlatformAccessory) {
				acc.receiveDaliColor(color).catch((reason) => {
					this.log.warn(`Failed to update ECG accessory "${acc.displayName}" color: ${reason}`)
				})
			}
		}

		this.zc.systemVariableChangeCallback = (controller, variable, value) => {
			const accessoryId = systemVariableToAccessoryId(controller, variable)
			const acc = this.accessoryMap.get(accessoryId)
			if (acc instanceof ZencontrolTemperaturePlatformAccessory) {
				acc.receiveTemperature(value).catch((reason) => {
					this.log.warn(`Failed to update temperature accessory "${acc.displayName}" color: ${reason}`)
				})
			}
		}
	}

	async sendArcLevel(accessoryId: string, arcLevel: number, instant = true): Promise<void> {
		const address = this.parseAccessoryId(accessoryId)

		if (instant) {
			await this.applyInstant(accessoryId, address)
		}

		try {
			await this.zc.daliArcLevel(address, arcLevel)
		} catch (error) {
			this.log.warn(`Failed to send arc level for ${address}:`, error)
		}
	}

	async sendColor(accessoryId: string, color: ZenColour, arcLevel: number, instant = true): Promise<void> {
		const address = this.parseAccessoryId(accessoryId)

		try {
			await this.zc.daliColour(address, color, arcLevel)
		} catch (error) {
			this.log.warn(`Failed to send color for ${address}:`, error)
		}
	}

	private async applyInstant(accessoryId: string, address: ZenAddress) {
		const now = Date.now()
		const lastSentDAPC = this.lastSentDAPC.get(accessoryId) || 0
		if (now - lastSentDAPC > 200) {
			/* We only need to stop fading once every 250ms */
			try {
				await this.zc.daliEnableDAPCSequence(address)
			} catch (error) {
				this.log.warn(`Failed to enable DAPC sequence for ${address}:`, error)
			}
			this.lastSentDAPC.set(accessoryId, now)
		}
	}

	private parseAccessoryId(accessoryId: string): ZenAddress {
		const parts = accessoryId.split(' ')
		if (parts.length < 2) {
			throw new Error(`Unrecognised accessory ID: ${accessoryId}`)
		}
		
		const controllerId = parseInt(parts[1])
		const controller = this.zc.controllers.find(c => c.id === controllerId)
		if (!controller) {
			throw new Error(`Unknown controller id: ${controllerId}`)
		}
			
		if (parts[0] === 'BROADCAST') {
			return new ZenAddress(controller, ZenAddressType.BROADCAST, 0)
		} else if (parts[0] === 'GROUP') {
			return new ZenAddress(controller, ZenAddressType.GROUP, parseInt(parts[2]))
		} else if (parts[0] === 'ECG') {
			return new ZenAddress(controller, ZenAddressType.ECG, parseInt(parts[2]))
		} else if (parts[0] === 'ECD') {
			return new ZenAddress(controller, ZenAddressType.ECD, parseInt(parts[2]))
		} else {
			throw new Error(`Unrecognised accessory ID: ${accessoryId}`)
		}
	}

}

function addressToAccessoryId(address: ZenAddress) {
	switch (address.type) {
	case ZenAddressType.BROADCAST:
		return `BROADCAST ${address.controller.id}`		
	case ZenAddressType.GROUP:
		return `GROUP ${address.controller.id} ${address.group()}`
	case ZenAddressType.ECG:
		return `ECG ${address.controller.id} ${address.ecg()}`
	case ZenAddressType.ECD:
		return `ECD ${address.controller.id} ${address.ecd()}`
	}
	throw new Error(`Unsupported ZenAddressType: ${address.type}`)
}

function systemVariableToAccessoryId(controller: ZenController, variable: number) {
	return `SYSVAR ${controller.id}.${variable}`
}

function isLightControlGear(type: ZenControlGearType) {
	return type === ZenControlGearType.DALI_HW_FLUORESCENT ||
		type === ZenControlGearType.DALI_HW_HALOGEN ||
		type === ZenControlGearType.DALI_HW_INCANDESCENT ||
		type === ZenControlGearType.DALI_HW_LED
}

function isColorControlGear(type: ZenControlGearType) {
	return type === ZenControlGearType.DALI_HW_COLOUR_CONTROL
}
