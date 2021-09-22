const status = 'online';

export async function newConnection(ctx) {
	const { uid, connection } = ctx.params;

	const query = {
		_id: uid,
	};

	const now = new Date();

	// const instanceId = InstanceStatus.id();
	const instanceId = ctx.nodeID;

	const update = {
		$push: {
			connections: {
				id: connection.id,
				instanceId,
				status,
				_createdAt: now,
				_updatedAt: now,
			},
		},
	};

	// if (metadata) {
	// 	update.$set = {
	// 		metadata: metadata
	// 	};
	// 	connection.metadata = metadata;
	// }

	await (this.userSession().updateOne(query, update, { upsert: true }));


	return {
		uid,
		connectionId: connection.id,
	};
}
