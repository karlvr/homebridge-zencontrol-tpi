import { PlatformConfig } from 'homebridge'

export interface MyPluginConfig {
	name: PlatformConfig['name']
	controllers?: {
		id?: number
		address?: string
		port?: number
		macAddress?: string
	}[]
	relays?: string[]
	co2AbnormalLevel?: number
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
