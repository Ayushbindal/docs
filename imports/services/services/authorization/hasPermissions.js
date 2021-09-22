const cache = process.env.TEST_MODE === 'true' ? {} : {
	type: 'memory',
	keys: ['permission', 'uid', 'scope'],
	ttl: 5,
};

export default {
	hasPermission: {
		...cache,
		params: {
			permission: 'string',
			uid: 'string',
			// scope: 'string',
		},
		async handler(ctx) {
			const { uid, permission, scope } = ctx.params;
			return RocketChat.authz.hasPermission(uid, permission, scope);
		},
	},
	hasPermissions: {
		...cache,
		params: {
			permissions: ['string'],
			uid: 'string',
		},
		handler(ctx) {
			const { uid, permissions, scope } = ctx.params;
			return RocketChat.authz.hasPermissions(uid, permissions, scope);
		},
	},
};
