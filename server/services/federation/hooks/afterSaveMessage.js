import { logger } from '../lib/logger';
import { FederationRoomEvents } from '../../../models';
import { normalizers } from '../normalizers';
import { hasExternalDomain } from '../functions/helpers';
import { getFederationDomain } from '../lib/getFederationDomain';
import { dispatchEvent } from '../handler';

async function afterSaveMessage(message, room) {
	// If there are not federated users on this room, ignore it
	if (!hasExternalDomain(room)) { return message; }

	logger.client.debug(() => `afterSaveMessage => message=${ JSON.stringify(message, null, 2) } room=${ JSON.stringify(room, null, 2) }`);

	let event;

	// If editedAt exists, it means it is an update
	if (message.editedAt) {
		// Create the edit message event
		event = await FederationRoomEvents.createEditMessageEvent(getFederationDomain(), room._id, normalizers.normalizeMessage(message));
	} else {
		// Create the message event
		event = await FederationRoomEvents.createMessageEvent(getFederationDomain(), room._id, normalizers.normalizeMessage(message));
	}

	// Dispatch event (async)
	dispatchEvent(room.federation.domains, event);

	return message;
}

export const definition = {
	hook: 'afterSaveMessage',
	callback: (message, room) => Promise.await(afterSaveMessage(message, room)),
	id: 'federation-after-save-message',
};
