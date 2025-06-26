import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge'

import { ZencontrolTPIPlatformAccessory } from './platformAccessory.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { MyPluginConfig } from './types.js'
import { ZenController, ZenConst, ZenProtocol, ZenAddress, ZenAddressType } from 'zencontrol-tpi-node'

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
	private groupAccessoryMap = new Map<string, ZencontrolTPIPlatformAccessory>()
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
		this.groupAccessoryMap.clear()

		for (const controller of this.zc.controllers) {
			for (let group = 0; group < ZenConst.MAX_GROUP; group++) {
				this.zc.queryGroupLabel(new ZenAddress(controller, ZenAddressType.GROUP, group)).then((label) => {
					if (label === null) {
						/* We treat these as not existing */
						return
					}
					const groupId = groupIdToString(controller, group)

					// generate a unique id for the accessory this should be generated from
					// something globally unique, but constant, for example, the device serial
					// number or MAC address
					const uuid = this.api.hap.uuid.generate(groupId)

					// see if an accessory with the same uuid has already been registered and restored from
					// the cached devices we stored in the `configureAccessory` method above
					const existingAccessory = this.accessories.get(uuid)

					if (existingAccessory) {
						// the accessory already exists
						this.log.info('Restoring existing group from cache:', existingAccessory.displayName)

						if (existingAccessory.displayName !== label) {
							this.log.info('Updating group name:', label)
							existingAccessory.updateDisplayName(label)
						}
				
						// if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
						// this.api.updatePlatformAccessories([existingAccessory])

						// create the accessory handler for the restored accessory
						// this is imported from `platformAccessory.ts`
						const acc = new ZencontrolTPIPlatformAccessory(this, existingAccessory)
						this.groupAccessoryMap.set(groupId, acc)

						// it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
						// remove platform accessories when no longer present
						// this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
						// this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
					} else {
						// the accessory does not yet exist, so we need to create it
						this.log.info('Adding new group:', label)

						// create a new accessory
						const accessory = new this.api.platformAccessory(label, uuid)

						// store a copy of the device object in the `accessory.context`
						// the `context` property can be used to store any data about the accessory you may need
						accessory.context.groupId = groupId

						// create the accessory handler for the newly create accessory
						// this is imported from `platformAccessory.ts`
						const acc = new ZencontrolTPIPlatformAccessory(this, accessory)
						this.groupAccessoryMap.set(groupId, acc)

						// link the accessory to your platform
						this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
					}

					// push into discoveredCacheUUIDs
					this.discoveredCacheUUIDs.push(uuid)
				})
			}
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

		this.activateLiveEvents()
	}

	private async activateLiveEvents() {
		this.zc.startEventMonitoring()

		this.zc.groupLevelChangeCallback = (address, arcLevel) => {
			const groupId = groupIdToString(address.controller, address.group())
			const acc = this.groupAccessoryMap.get(groupId)
			if (acc) {
				acc.receiveDaliBrightness(arcLevel).catch((reason) => {
					this.log.warn(`Failed to update group accessor brightness: ${reason}`)
				})
			}
		}
	}

	async sendGroupArcLevel(groupId: string, arcLevel: number, instant = true): Promise<void> {
		const [controller, group] = this.parseGroupId(groupId)

		const address = new ZenAddress(controller, ZenAddressType.GROUP, group)
		const now = Date.now()
		const lastSentDAPC = this.lastSentDAPC.get(groupId) || 0
		if (instant && now - lastSentDAPC > 200) {
			/* We only need to stop fading once every 250ms */
			await this.zc.daliEnableDAPCSequence(address)
			this.lastSentDAPC.set(groupId, now)
		}
		await this.zc.daliArcLevel(address, arcLevel)
	}

	private parseGroupId(groupId: string): [ZenController, number] {
		const i = groupId.indexOf('-')
		if (i === -1) {
			throw new Error(`Invalid groupId: ${groupId}`)
		}

		const id = parseInt(groupId.substring(0, i))
		const group = parseInt(groupId.substring(i + 1))
		if (isNaN(id) || isNaN(group)) {
			throw new Error(`Invalid groupId: ${groupId}`)
		}

		for (const controller of this.zc.controllers) {
			if (controller.id === id) {
				return [controller, group]
			}
		}

		throw new Error(`Unknown controller id in groupId: ${groupId}`)
	}

}

function groupIdToString(controller: ZenController, group: number) {
	return `${controller.id}-${group}`
}
