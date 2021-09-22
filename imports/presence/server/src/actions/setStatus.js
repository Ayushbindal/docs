const STATUS = ['online', 'away', 'busy', 'offline'];

export const setStatus = {
	params: {
		uid: 'string',
		status: 'string',
	},
	async handler(ctx) {
		const { uid, status } = ctx.params;
		if (STATUS.indexOf(status) === -1) {
			return;
		}

		return this.user().updateOne({ _id: uid, statusDefault: { $ne: status } }, { $set: { statusDefault: status } });
	},
};

export const setConnectionStatus = {
	params: {
		uid: 'string',
		status: 'string',
	},
	handler(ctx) {
		const { uid, status, connection } = ctx.params;

		const query = {
			_id: uid,
			'connections.id': connection.id,
		};

		const now = new Date();

		const update = {
			$set: {
				'connections.$.status': status,
				'connections.$._updatedAt': now,
			},
		};

		// if (connection.metadata) {
		// 	update.$set.metadata = connection.metadata;
		// }

		return this.userSession().updateOne(query, update);
	},
};
