import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge'

import { ZencontrolLightPlatformAccessory } from './lightAccessory.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { isZencontrolSystemVariableAccessory, MyPluginConfig, ZencontrolTPIPlatformAccessory, ZencontrolTPIPlatformAccessoryContext } from './types.js'
import { ZenController, ZenProtocol, ZenAddress, ZenAddressType, ZenControlGearType, ZenColour, ZenConst } from 'zencontrol-tpi-node'
import { ZencontrolTemperaturePlatformAccessory } from './temperatureAccessory.js'
import { ZencontrolHumidityPlatformAccessory } from './humidityAccessory.js'
import { ZencontrolRelayPlatformAccessory } from './relayAccessory.js'
import { ZencontrolFanPlatformAccessory } from './fanAccessory.js'
import { ZencontrolBlindPlatformAccessory } from './blindAccessory.js'
import { ZencontrolWindowPlatformAccessory } from './windowAccessory.js'
import { ZencontrolLuxPlatformAccessory } from './luxAccessory.js'
import { ZencontrolCO2PlatformAccessory } from './co2Accessory.js'

interface ZencontrolTPIPlatformAccessoryConfiguration<T extends ZencontrolTPIPlatformAccessory, O> {
	address: string
	label: string
	model: string
	serial: string

	options: O

	accessoryTypeName: string
	AccessoryClass: new (platform: ZencontrolTPIPlatform, accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>, options: O) => T
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
	public readonly accessories: Map<string, PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>> = new Map()
	public readonly discoveredCacheUUIDs = new Set<string>()

	private zc: ZenProtocol
	private accessoriesByAddress = new Map<string, ZencontrolTPIPlatformAccessory>()
	private accessoryNeedsRegister: PlatformAccessory[] = []
	private accessoryNeedsUpdate: PlatformAccessory[] = []
	private lastSentDAPC = new Map<string, number>()
	readonly config: MyPluginConfig

	constructor(
		public readonly log: Logging,
		config: MyPluginConfig & PlatformConfig,
		public readonly api: API,
	) {
		this.config = config
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
			this.discoverDevices().then(() => {
				this.activateLiveEvents()
			})
		})
	}

	/**
	 * This function is invoked when homebridge restores cached accessories from disk at startup.
	 * It should be used to set up event handlers for characteristics and update respective values.
	 */
	configureAccessory(accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>) {
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
		this.log.info('Discovering groups and devices')
		this.accessoriesByAddress.clear()

		const promises: Promise<unknown>[] = []
		const positionVariables: { label: string, address: string, value: number | null }[] = []

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

						const acc = this.addAccessory({
							address: addressToString(group),
							label,
							model: 'DALI Group',
							serial: `${controller.id}.${group.group()}`,
							accessoryTypeName: 'light',
							AccessoryClass: ZencontrolLightPlatformAccessory,
							options: {},
						})
						const groupStatus = await this.zc.queryGroupByNumber(group)
						if (groupStatus) {
							acc.receiveArcLevel(groupStatus.level)
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
								const acc = this.addAccessory({
									address: addressToString(ecg),
									label,
									model: 'ECG',
									serial: `${controller.id}.${ecg.ecg()}`,
									accessoryTypeName: 'light',
									AccessoryClass: ZencontrolLightPlatformAccessory,
									options: {
										color,
									},
								})
								const level = await this.zc.daliQueryLevel(ecg)
								if (level !== null) {
									acc.receiveArcLevel(level)
								}
							} else if (types.find(isRelayControlGear)) {
								const label = await this.zc.queryDaliDeviceLabel(ecg)
								if (!label) {
									return
								}

								if ((this.config.blinds ?? []).includes(label)) {
									const acc = this.addAccessory({
										address: addressToString(ecg),
										label,
										model: 'Relay',
										serial: `${controller.id}.${ecg.ecg()}`,
										accessoryTypeName: 'blind',
										AccessoryClass: ZencontrolBlindPlatformAccessory,
										options: {},
									})
									const level = await this.zc.daliQueryLevel(ecg)
									if (level !== null) {
										acc.receiveArcLevel(level)
									}
								} else if ((this.config.fans ?? []).includes(label)) {
									const acc = this.addAccessory({
										address: addressToString(ecg),
										label,
										model: 'Fan',
										serial: `${controller.id}.${ecg.ecg()}`,
										accessoryTypeName: 'fan',
										AccessoryClass: ZencontrolFanPlatformAccessory,
										options: {},
									})
									const level = await this.zc.daliQueryLevel(ecg)
									if (level !== null) {
										acc.receiveArcLevel(level)
									}
								} else if ((this.config.relays ?? []).includes(label)) {
									const acc = this.addAccessory({
										address: addressToString(ecg),
										label,
										model: 'Relay',
										serial: `${controller.id}.${ecg.ecg()}`,
										accessoryTypeName: 'relay',
										AccessoryClass: ZencontrolRelayPlatformAccessory,
										options: {},
									})
									const level = await this.zc.daliQueryLevel(ecg)
									if (level !== null) {
										acc.receiveArcLevel(level)
									}
								} else {
									this.log.debug(`Ignoring relay as it is not listed in the config: ${label}`)
									return
								}
							}
						}
					}))
				}
				return Promise.all(promises)
			}))

			for (let variable = 0; variable < ZenConst.MAX_SYSVAR; variable++) {
				promises.push(this.zc.querySystemVariableName(controller, variable).then(async label => {
					if (!label) {
						return
					}

					const address = systemVariableToAddressString(controller, variable)

					if ((this.config.windows ?? []).includes(label)) {
						const value = await this.zc.querySystemVariable(controller, variable)

						const acc = this.addAccessory({
							address,
							label,
							model: 'System Variable',
							serial: `SV ${controller.id}.${variable}`,
							accessoryTypeName: 'window',
							AccessoryClass: ZencontrolWindowPlatformAccessory,
							options: {
								controlSystemVariableAddress: address,
							},
						})
						acc.receiveSystemVariableChange(address, value)
					} else if (label.toLocaleLowerCase().endsWith(' temperature')) {
						const value = await this.zc.querySystemVariable(controller, variable)

						const acc = this.addAccessory({
							address,
							label: label.substring(0, label.length - ' temperature'.length),
							model: 'System Variable',
							serial: `SV ${controller.id}.${variable}`,
							accessoryTypeName: 'temperature',
							AccessoryClass: ZencontrolTemperaturePlatformAccessory,
							options: {},
						})
						acc.receiveSystemVariableChange(address, value)
					} else if (label.toLocaleLowerCase().endsWith(' humidity')) {
						const value = await this.zc.querySystemVariable(controller, variable)

						const acc = this.addAccessory({
							address,
							label: label.substring(0, label.length - ' humidity'.length),
							model: 'System Variable',
							serial: `SV ${controller.id}.${variable}`,
							accessoryTypeName: 'humidity',
							AccessoryClass: ZencontrolHumidityPlatformAccessory,
							options: {},
						})
						acc.receiveSystemVariableChange(address, value)
					} else if (label.toLocaleLowerCase().endsWith(' lux')) {
						const value = await this.zc.querySystemVariable(controller, variable)

						const acc = this.addAccessory({
							address,
							label: label.substring(0, label.length - ' lux'.length),
							model: 'System Variable',
							serial: `SV ${controller.id}.${variable}`,
							accessoryTypeName: 'lux',
							AccessoryClass: ZencontrolLuxPlatformAccessory,
							options: {},
						})
						acc.receiveSystemVariableChange(address, value)
					} else if (label.toLocaleLowerCase().endsWith(' co2')) {
						const value = await this.zc.querySystemVariable(controller, variable)

						const acc = this.addAccessory({
							address,
							label: label.substring(0, label.length - ' co2'.length),
							model: 'System Variable',
							serial: `SV ${controller.id}.${variable}`,
							accessoryTypeName: 'CO2',
							AccessoryClass: ZencontrolCO2PlatformAccessory,
							options: {},
						})
						acc.receiveSystemVariableChange(address, value)
					} else if (label.toLocaleLowerCase().endsWith(' position')) {
						const value = await this.zc.querySystemVariable(controller, variable)
						positionVariables.push({ label, address, value })
					} else {
						this.log.debug(`Ignoring unrecognised system variable: ${label}`)
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

		/* Position variables; we come back and handle the position variables now that we've created all of the accessories */
		for (const { label, address, value } of positionVariables) {
			let foundAcc: ZencontrolBlindPlatformAccessory | ZencontrolWindowPlatformAccessory | undefined = undefined
			for (const [_, acc] of this.accessoriesByAddress) {
				if (acc instanceof ZencontrolBlindPlatformAccessory || acc instanceof ZencontrolWindowPlatformAccessory) {
					if ((acc.displayName + ' position').toLocaleLowerCase() === label.toLocaleLowerCase()) {
						foundAcc = acc
						break
					}
				}
			}

			if (foundAcc) {
				this.log.info(`Found position system variable for ${foundAcc.displayName}: ${label}`)
				foundAcc.positionSystemVariableAddress = address

				this.accessoriesByAddress.set(address, foundAcc)
				foundAcc.receiveSystemVariableChange(address, value)
			} else {
				this.log.debug(`Ignoring position system variable as no matching accessory found: ${label}`)
			}
		}

		// you can also deal with accessories from the cache which are no longer present by removing them from Homebridge
		// for example, if your plugin logs into a cloud account to retrieve a device list, and a user has previously removed a device
		// from this cloud account, then this device will no longer be present in the device list but will still be in the Homebridge cache
		for (const [uuid, accessory] of this.accessories) {
			if (!this.discoveredCacheUUIDs.has(uuid)) {
				this.log.info('Removing existing accessory from cache:', accessory.displayName)
				this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
			}
		}

		if (this.accessoryNeedsRegister.length) {
			this.log.info(`Registering ${this.accessoryNeedsRegister.length} accessories`)
			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessoryNeedsRegister)
			this.accessoryNeedsRegister.splice(0, this.accessoryNeedsRegister.length)
		}

		if (this.accessoryNeedsUpdate.length) {
			this.log.info(`Updating ${this.accessoryNeedsUpdate.length} accessories`)
			this.api.updatePlatformAccessories(this.accessoryNeedsUpdate)
			this.accessoryNeedsUpdate.splice(0, this.accessoryNeedsUpdate.length)
		}

		this.log.info('Device discovery complete')
	}

	private addAccessory<O, T extends ZencontrolTPIPlatformAccessory>(config: ZencontrolTPIPlatformAccessoryConfiguration<T, O>): T {
		const uuid = this.api.hap.uuid.generate(`${config.accessoryTypeName.toLocaleLowerCase()} @ ${config.address}`)
		const existingAccessory = this.accessories.get(uuid)

		let acc: T
		if (existingAccessory) {
			this.log.debug(`Restoring existing ${config.accessoryTypeName} accessory from cache:`, existingAccessory.displayName)

			this.updateAccessory(existingAccessory, config)

			acc = new config.AccessoryClass(this, existingAccessory, config.options)
		} else {
			this.log.info(`Adding new ${config.accessoryTypeName} accessory:`, config.label)

			const accessory = new this.api.platformAccessory<ZencontrolTPIPlatformAccessoryContext>(config.label, uuid)
			this.setupAccessory(accessory, config)

			acc = new config.AccessoryClass(this, accessory, config.options)
		}

		this.accessoriesByAddress.set(config.address, acc)

		this.discoveredCacheUUIDs.add(uuid)
		return acc
	}

	private setupAccessory<O, T extends ZencontrolTPIPlatformAccessory>(accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>, { address, label, model, serial }: ZencontrolTPIPlatformAccessoryConfiguration<T, O>): void {
		accessory.context.address = address
		accessory.context.model = model
		accessory.context.serial = serial

		const nameCharacteristic = accessory.getService(this.Service.AccessoryInformation)!
			.getCharacteristic(this.Characteristic.Name)
		nameCharacteristic.updateValue(label)

		this.accessoryNeedsRegister.push(accessory)
	}

	private updateAccessory<O, T extends ZencontrolTPIPlatformAccessory>(existingAccessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>, { address, label, model, serial }: ZencontrolTPIPlatformAccessoryConfiguration<T, O>): boolean {
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
		if (existingAccessory.context.address !== address) {
			existingAccessory.context.address = address
			needsUpdate = true
		}
		if (existingAccessory.context.model !== model) {
			existingAccessory.context.model = model
			needsUpdate = true
		}
		if (existingAccessory.context.serial !== serial) {
			existingAccessory.context.serial = serial
			needsUpdate = true
		}

		if (needsUpdate) {
			this.log.info(`Updating existing ${model} acccessory context: ${existingAccessory.displayName}`)
			this.accessoryNeedsUpdate.push(existingAccessory)
		}
		return needsUpdate
	}

	setupAccessoryInformation(accessory: PlatformAccessory<ZencontrolTPIPlatformAccessoryContext>): void {
		accessory.getService(this.Service.AccessoryInformation)!
			.setCharacteristic(this.Characteristic.Manufacturer, 'Zencontrol')
			.setCharacteristic(this.Characteristic.Model, accessory.context.model || 'Unknown')
			.setCharacteristic(this.Characteristic.SerialNumber, accessory.context.serial || 'Unknown')
	}

	private async activateLiveEvents() {
		this.zc.groupLevelChangeCallback = (address, arcLevel) => {
			const accessoryId = addressToString(address)
			const acc = this.accessoriesByAddress.get(accessoryId)
			if (acc instanceof ZencontrolLightPlatformAccessory) {
				acc.receiveArcLevel(arcLevel).catch((reason) => {
					this.log.warn(`Failed to update group accessory "${acc.displayName}" brightness: ${reason}`)
				})
			}
		}
		
		this.zc.levelChangeCallback = (address, arcLevel) => {
			const accessoryId = addressToString(address)
			const acc = this.accessoriesByAddress.get(accessoryId)
			if (acc instanceof ZencontrolLightPlatformAccessory || acc instanceof ZencontrolRelayPlatformAccessory || acc instanceof ZencontrolBlindPlatformAccessory || acc instanceof ZencontrolFanPlatformAccessory) {
				acc.receiveArcLevel(arcLevel).catch((reason) => {
					this.log.warn(`Failed to update accessory "${acc.displayName}" brightness: ${reason}`)
				})
			}
		}

		this.zc.colourChangeCallback = (address, color) => {
			const accessoryId = addressToString(address)
			const acc = this.accessoriesByAddress.get(accessoryId)
			if (acc instanceof ZencontrolLightPlatformAccessory) {
				acc.receiveDaliColor(color).catch((reason) => {
					this.log.warn(`Failed to update accessory "${acc.displayName}" color: ${reason}`)
				})
			}
		}

		this.zc.systemVariableChangeCallback = (controller, variable, value) => {
			const variableAddress = systemVariableToAddressString(controller, variable)
			const acc = this.accessoriesByAddress.get(variableAddress)
			if (!acc) {
				return
			}

			if (isZencontrolSystemVariableAccessory(acc)) {
				acc.receiveSystemVariableChange(variableAddress, value).catch((reason) => {
					this.log.warn(`Failed to update accessory "${acc.displayName}": ${reason}`)
				})
			} else {
				this.log.warn(`Received system variable change for unsupported accessory: ${acc?.displayName}`)
			}
		}

		this.log.info('Starting live event monitoring')
		await this.zc.startEventMonitoring()
	}

	async sendArcLevel(accessoryId: string, arcLevel: number, instant = true): Promise<void> {
		const address = this.parseAccessoryId(accessoryId)

		if (instant) {
			await this.applyInstant(accessoryId, address)
		}

		try {
			const result = await this.zc.daliArcLevel(address, arcLevel)
			if (!result) {
				this.log.warn(`Failed to send arc level ${arcLevel} for ${address}`)
			}
		} catch (error) {
			this.log.warn(`Failed to send arc level for ${address}:`, error)
		}
	}

	async sendOff(accessoryId: string): Promise<void> {
		const address = this.parseAccessoryId(accessoryId)
		try {
			const result = await this.zc.daliOff(address)
			if (!result) {
				this.log.warn(`Failed to send off for ${address}`)
			}
		} catch (error) {
			this.log.warn(`Failed to send off for ${address}:`, error)
		}
	}

	async sendRecallMin(accessoryId: string): Promise<void> {
		const address = this.parseAccessoryId(accessoryId)
		try {
			const result = await this.zc.daliRecallMin(address)
			if (!result) {
				this.log.warn(`Failed to send recall min for ${address}`)
			}
		} catch (error) {
			this.log.warn(`Failed to send recall min for ${address}:`, error)
		}
	}

	async sendRecallMax(accessoryId: string): Promise<void> {
		const address = this.parseAccessoryId(accessoryId)
		try {
			const result = await this.zc.daliRecallMax(address)
			if (!result) {
				this.log.warn(`Failed to send recall max for ${address}`)
			}
		} catch (error) {
			this.log.warn(`Failed to send recall max for ${address}:`, error)
		}
	}

	async setSystemVariable(address: string, value: number): Promise<void> {
		const { controller, variable } = this.parseSystemVariableAddress(address)
		try {
			const result = await this.zc.setSystemVariable(controller, variable, value)
			if (!result) {
				this.log.warn(`Failed to set system variable ${controller.id}.${variable} to ${value}`)
			}
		} catch (error) {
			this.log.warn(`Failed to set system variable ${controller.id}.${variable} to ${value}: ${error}`)
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

	private parseSystemVariableAddress(address: string): { controller: ZenController, variable: number } {
		const parts = address.split(' ')
		if (parts.length < 2) {
			throw new Error(`Unrecognised system variable adddress: ${address}`)
		}

		const controllerId = parseInt(parts[1])
		const controller = this.zc.controllers.find(c => c.id === controllerId)
		if (!controller) {
			throw new Error(`Unknown controller id: ${controllerId}`)
		}
			
		if (parts[0] === 'SV') {
			return { controller, variable: Number(parts[2]) }
		} else {
			throw new Error(`Unrecognised system variable address: ${address}`)
		}
	}

}

function addressToString(address: ZenAddress) {
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

function systemVariableToAddressString(controller: ZenController, variable: number) {
	return `SV ${controller.id} ${variable}`
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

function isRelayControlGear(type: ZenControlGearType) {
	return type === ZenControlGearType.DALI_HW_RELAY
}
