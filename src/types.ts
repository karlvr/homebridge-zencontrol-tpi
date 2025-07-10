import { PlatformConfig } from 'homebridge'

export interface MyPluginConfig extends PlatformConfig {
	controllers?: {
		id?: number
		address?: string
		port?: number
		macAddress?: string
	}[]
	relays?: string[]
	debug?: boolean
}

export interface ZencontrolTPIPlatformAccessory {
	get displayName(): string
}

export interface ZencontrolTPIPlatformAccessoryContext {
	address: string
	model: string
	serial: string
}
