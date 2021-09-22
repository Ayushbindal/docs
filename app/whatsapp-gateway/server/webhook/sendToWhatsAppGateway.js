import { Meteor } from 'meteor/meteor';

import { FileUpload } from '../../../file-upload';
import { Uploads, LivechatVisitors } from '../../../models';
import { callbacks } from '../../../callbacks';
import { settings } from '../../../settings';
import WhatsAppGateway from '../WhatsAppGateway';

callbacks.add('afterSaveMessage', function(message, room) {
	if (!WhatsAppGateway.enabled) {
		return message;
	}

	const WhatsAppService = WhatsAppGateway.getService(settings.get('WhatsApp_Gateway_Service'));
	if (!WhatsAppService) {
		return message;
	}


	if (!(typeof room.t !== 'undefined' && room.t === 'l' && room.whatsAppGateway && room.v && room.v.token)) {
		return message;
	}

	if (message.editedAt) {
		return message;
	}

	if (message.token) {
		return message;
	}

	if (message.t) {
		return message;
	}

	let { msg } = message;

	let attachment;
	if (message.file) {
		const { _id } = message.file;
		const file = Uploads.findOneById(_id);
		if (file) {
			const getFileBuffer = Meteor.wrapAsync(FileUpload.getBuffer, FileUpload);
			const buffer = getFileBuffer(file);
			const rs = new Buffer(buffer);
			const dataURI = rs.toString('base64');
			// const dataURI = `data:${ type };base64,${ data }`;

			const { type, size, name, description } = file;
			attachment = {
				type,
				size,
				dataURI,
			};

			msg = description || name;
		}
	}
	const visitor = LivechatVisitors.getVisitorByToken(room.v.token);

	if (!visitor || !visitor.phone || visitor.phone.length === 0) {
		return message;
	}

	const { rid, u: { _id: userId } = {} } = message;
	const { from, conversationId: token } = room.whatsAppGateway;
	const extraData = { rid, userId, attachment, token };
	WhatsAppService.send(from, visitor.phone[0].phoneNumber, msg, extraData);

	return message;
}, callbacks.priority.LOW, 'sendToWhatsAppGateway');

callbacks.add('livechat.closeRoom', (room) => {
	if (!WhatsAppGateway.enabled) {
		return room;
	}

	const WhatsAppService = WhatsAppGateway.getService(settings.get('WhatsApp_Gateway_Service'));

	if (!WhatsAppService) {
		return room;
	}

	const config = WhatsAppService.getConfig() || {};
	const { conversationFinishedMessage } = config;
	if (!conversationFinishedMessage) {
		return room;
	}

	if (!(room.whatsAppGateway && room.v && room.v.token && room.closer && room.closer === 'user')) {
		return room;
	}

	const visitor = LivechatVisitors.getVisitorByToken(room.v.token);
	if (!visitor || !visitor.phone || visitor.phone.length === 0) {
		return room;
	}

	const { conversationId: token } = room.whatsAppGateway;
	WhatsAppService.send(room.whatsAppGateway.from, visitor.phone[0].phoneNumber, conversationFinishedMessage, { token });
}, callbacks.priority.MEDIUM, 'send-whatsapp-gateway-close-room');
