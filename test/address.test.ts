import { describe, expect, it } from 'vitest'
import { ZenAddress, ZenAddressType, ZenController } from 'zencontrol-tpi-node'

import { addressToString, parseAddressString, parseSystemVariableAddressString, systemVariableToAddressString } from '../src/address.js'

const controller = new ZenController({ id: 1, host: '127.0.0.1', macAddress: '00:11:22:33:44:55' })
const controllers = [controller]

describe('addressToString', () => {
	it('formats each address type', () => {
		expect(addressToString(new ZenAddress(controller, ZenAddressType.BROADCAST, 0))).toBe('BROADCAST 1')
		expect(addressToString(new ZenAddress(controller, ZenAddressType.GROUP, 5))).toBe('GROUP 1 5')
		expect(addressToString(new ZenAddress(controller, ZenAddressType.ECG, 12))).toBe('ECG 1 12')
		expect(addressToString(new ZenAddress(controller, ZenAddressType.ECD, 7))).toBe('ECD 1 7')
	})
})

describe('parseAddressString', () => {
	it('round-trips each address type', () => {
		for (const original of ['BROADCAST 1', 'GROUP 1 5', 'ECG 1 12', 'ECD 1 7']) {
			const parsed = parseAddressString(original, controllers)
			expect(parsed.controller).toBe(controller)
			expect(addressToString(parsed)).toBe(original)
		}
	})

	it('rejects truncated addresses', () => {
		expect(() => parseAddressString('GROUP 1', controllers)).toThrow('Unrecognised accessory ID')
		expect(() => parseAddressString('GROUP', controllers)).toThrow('Unrecognised accessory ID')
		expect(() => parseAddressString('', controllers)).toThrow('Unrecognised accessory ID')
	})

	it('rejects unknown address types', () => {
		expect(() => parseAddressString('SCENE 1 5', controllers)).toThrow('Unrecognised accessory ID')
	})

	it('rejects unknown controllers', () => {
		expect(() => parseAddressString('GROUP 2 5', controllers)).toThrow('Unknown controller id')
		expect(() => parseAddressString('GROUP x 5', controllers)).toThrow('Unknown controller id')
	})
})

describe('system variable addresses', () => {
	it('round-trips', () => {
		const address = systemVariableToAddressString(controller, 42)
		expect(address).toBe('SV 1 42')

		const parsed = parseSystemVariableAddressString(address, controllers)
		expect(parsed.controller).toBe(controller)
		expect(parsed.variable).toBe(42)
	})

	it('rejects malformed addresses', () => {
		expect(() => parseSystemVariableAddressString('SV 1', controllers)).toThrow('Unrecognised system variable address')
		expect(() => parseSystemVariableAddressString('GROUP 1 5', controllers)).toThrow('Unrecognised system variable address')
		expect(() => parseSystemVariableAddressString('', controllers)).toThrow('Unrecognised system variable address')
	})

	it('rejects unknown controllers', () => {
		expect(() => parseSystemVariableAddressString('SV 2 42', controllers)).toThrow('Unknown controller id')
	})
})
