import { PlatformConfig } from 'homebridge'

export interface MyPluginConfig {
	name: PlatformConfig['name']
	controllers?: {
		id?: number
		address?: string
		port?: number
		macAddress?: string
	}[]
	blinds?: string[]
	windows?: string[]
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

export interface ZencontrolSystemVariableAccessory {
	receiveSystemVariableChange(systemVariableAddress: string, value: number | null): Promise<void>
}

export function isZencontrolSystemVariableAccessory(acc: unknown): acc is ZencontrolSystemVariableAccessory {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (typeof (acc as any).receiveSystemVariableChange === 'function')
}
