import { describe, expect, it } from 'vitest'

import { isZencontrolSystemVariableAccessory } from '../src/types.js'

describe('isZencontrolSystemVariableAccessory', () => {
	it('accepts objects with a receiveSystemVariableChange function', () => {
		expect(isZencontrolSystemVariableAccessory({ receiveSystemVariableChange: async () => {} })).toBe(true)
	})

	it('rejects values without a receiveSystemVariableChange function', () => {
		expect(isZencontrolSystemVariableAccessory({})).toBe(false)
		expect(isZencontrolSystemVariableAccessory({ receiveSystemVariableChange: 'yes' })).toBe(false)
		expect(isZencontrolSystemVariableAccessory(null)).toBe(false)
		expect(isZencontrolSystemVariableAccessory(undefined)).toBe(false)
		expect(isZencontrolSystemVariableAccessory(42)).toBe(false)
	})
})
