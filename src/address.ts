import { ZenAddress, ZenAddressType, ZenController } from 'zencontrol-tpi-node'

/*
 * Conversions between structured DALI / system variable identities and their canonical string
 * address forms (e.g. "GROUP 1 5", "ECG 1 12", "SV 1 42"). A string address uniquely identifies
 * a device or system variable across controllers, and round-trips back to its structured form
 * given the set of known controllers.
 */

/**
 * Returns the canonical string address for a DALI address.
 */
export function addressToString(address: ZenAddress): string {
	switch (address.type) {
	case ZenAddressType.BROADCAST:
		return `BROADCAST ${address.controller.id}`
	case ZenAddressType.GROUP:
		return `GROUP ${address.controller.id} ${address.group()}`
	case ZenAddressType.ECG:
		return `ECG ${address.controller.id} ${address.ecg()}`
	case ZenAddressType.ECD:
		/* ecd() returns the DALI bus address form (target + 64); the string address uses the
		   raw device index so that it round-trips through parseAddressString like ECG and GROUP */
		return `ECD ${address.controller.id} ${address.target}`
	}
	throw new Error(`Unsupported ZenAddressType: ${String(address.type)}`)
}

/**
 * Returns the canonical string address for a system variable on a controller.
 */
export function systemVariableToAddressString(controller: ZenController, variable: number): string {
	return `SV ${controller.id} ${variable}`
}

/**
 * Parses a string address produced by addressToString back into a ZenAddress.
 * Throws if the address is malformed or does not reference one of the given controllers.
 */
export function parseAddressString(accessoryId: string, controllers: ZenController[]): ZenAddress {
	const [type, controllerIdString, targetString] = accessoryId.split(' ')
	if (!type || !controllerIdString) {
		throw new Error(`Unrecognised accessory ID: ${accessoryId}`)
	}

	const controllerId = parseInt(controllerIdString)
	const controller = controllers.find(c => c.id === controllerId)
	if (!controller) {
		throw new Error(`Unknown controller id: ${controllerId}`)
	}

	if (type === 'BROADCAST') {
		return new ZenAddress(controller, ZenAddressType.BROADCAST, 0)
	}

	if (!targetString) {
		throw new Error(`Unrecognised accessory ID: ${accessoryId}`)
	}

	if (type === 'GROUP') {
		return new ZenAddress(controller, ZenAddressType.GROUP, parseInt(targetString))
	} else if (type === 'ECG') {
		return new ZenAddress(controller, ZenAddressType.ECG, parseInt(targetString))
	} else if (type === 'ECD') {
		return new ZenAddress(controller, ZenAddressType.ECD, parseInt(targetString))
	} else {
		throw new Error(`Unrecognised accessory ID: ${accessoryId}`)
	}
}

/**
 * Parses a system variable string address produced by systemVariableToAddressString.
 * Throws if the address is malformed or does not reference one of the given controllers.
 */
export function parseSystemVariableAddressString(address: string, controllers: ZenController[]): { controller: ZenController, variable: number } {
	const [type, controllerIdString, variableString] = address.split(' ')
	if (type !== 'SV' || !controllerIdString || !variableString) {
		throw new Error(`Unrecognised system variable address: ${address}`)
	}

	const controllerId = parseInt(controllerIdString)
	const controller = controllers.find(c => c.id === controllerId)
	if (!controller) {
		throw new Error(`Unknown controller id: ${controllerId}`)
	}

	return { controller, variable: Number(variableString) }
}
