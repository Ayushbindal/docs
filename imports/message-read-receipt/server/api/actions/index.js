import { Meteor } from 'meteor/meteor';
import { ReadReceipt } from '../../lib/ReadReceipt';

export default {
	async getReadReceipts(ctx) {
		const { messageId, uid } = ctx.params;
		const message = RocketChat.models.Messages.findOneById(messageId);

		if (!message) {
			throw new Meteor.Error('error-invalid-message', 'Invalid message', { method: 'getReadReceipts' });
		}
		const room = await ctx.call('authorization.canAccessRoom', { rid: message.rid, uid });

		if (!room) {
			throw new Meteor.Error('error-invalid-room', 'Invalid room', { method: 'getReadReceipts' });
		}

		return ReadReceipt.getReceipts(message);
	},
};
