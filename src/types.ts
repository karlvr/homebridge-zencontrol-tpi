import { PlatformConfig } from 'homebridge'

export interface MyPluginConfig extends PlatformConfig {
	controllers?: {
		id?: number
		address?: string
		port?: number
		macAddress?: string
	}[]
	debug?: boolean
}
