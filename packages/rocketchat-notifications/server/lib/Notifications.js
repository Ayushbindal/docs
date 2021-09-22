import { Meteor } from 'meteor/meteor';

import { Streamer, Stream } from './streamer';

const MY_MESSAGES = '__my_messages__';
const MY_MESSAGES_STREAM = '_m_';

class RoomMessage extends Stream {
	subscribe(publication, eventName, options) {
		const uid = Meteor.userId();
		if (eventName !== MY_MESSAGES) {
			super.subscribe(publication, eventName, options);
			const revokeSubscription = (clientAction, { rid }) => {
				if (clientAction === 'removed' && rid === eventName) {
					publication.stop();
					this.internals.removeListener(uid, revokeSubscription);
				}
			};
			this.internals.on(uid, revokeSubscription);
			return;
		}

		if (!this.isReadAllowed(publication, eventName)) {
			publication.stop();
			return;
		}

		const { socket } = publication._session;
		const sendMyMessage = (msg) => this.send(socket, msg);

		const rooms = RocketChat.models.Subscriptions.find({ 'u._id': uid }, { fields: { rid: 1 } }).fetch();

		const userEvent = (clientAction, { rid }) => {
			switch (clientAction) {
				case 'inserted':
					rooms.push({ rid });
					this.internals.on(`${ MY_MESSAGES_STREAM }${ rid }`, sendMyMessage);
					break;

				case 'removed':
					this.internals.removeListener(rid, sendMyMessage);
					break;
			}
		};

		rooms.forEach(({ rid }) => this.internals.on(`${ MY_MESSAGES_STREAM }${ rid }`, sendMyMessage));

		this.internals.on(uid, userEvent);

		publication.onStop(() => {
			this.internals.removeListener(uid, userEvent);
			rooms.forEach(({ rid }) => this.internals.removeListener(`${ MY_MESSAGES_STREAM }${ rid }`, sendMyMessage));
		});
		publication.ready();
	}
}

class NotifyUser extends Stream {
	subscribe(publication, eventName, options) {
		const uid = Meteor.userId();

		if ('rooms-changed' === eventName) {
			if (!this.isReadAllowed(publication, eventName, options)) {
				publication.stop();
			}
			const { socket } = publication._session;
			const rooms = [];

			RocketChat.models.Subscriptions.find({ 'u._id': uid }, { fields: { rid: 1 } }).forEach(({ rid }) => rooms.push({ rid, remove: this.addSubscription(rid, socket) }));

			const userEvent = (clientAction, { rid }) => {
				switch (clientAction) {
					case 'inserted':
					case 'insert':
						rooms.push({ rid, remove: this.addSubscription(rid, socket) });
						break;

					case 'removed':
					case 'remove':
						const sub = rooms.findIndex(({ rid: roomId }) => roomId === rid);
						if (sub > -1) {
							rooms[sub].remove();
							rooms.splice(sub, 1);
						}
						break;
				}
			};

			this.internals.on(uid, userEvent);
			publication.onStop(() => {
				this.internals.removeListener(uid, userEvent);

				while (rooms.length) {
					rooms[0].remove();
					rooms.pop();
				}
			});
			return publication.ready();
		}

		if (/rooms-changed/.test(eventName)) {
			if (!this.isReadAllowed(publication, eventName, options)) {
				publication.stop();
			}
			const { socket } = publication._session;
			const roomEvent = (...args) => {
				// RocketChat.Notifications.notifyUserInThisInstance(uid, 'rooms-changed', ...args);
				// same behaviour but without sending multiple times
				// TODO performance: remove concatenation id + room-changed to use just one EJSON.serialize
				socket.send(this.changedPayload({
					eventName: `${ uid }/rooms-changed`,
					args,
				}, this.subscriptionName));
			};

			const rooms = RocketChat.models.Subscriptions.find({ 'u._id': uid }, { fields: { rid: 1 } }).fetch();

			rooms.forEach(({ rid }) => this.internals.on(rid, roomEvent));

			RocketChat.models.Subscriptions.find({ 'u._id': uid }, { fields: { rid: 1 } }).forEach(({ rid }) => rooms.push({ rid, remove: this.addSubscription(rid, socket) }));

			const userEvent = (clientAction, { rid }) => {
				switch (clientAction) {
					case 'inserted':
					case 'insert':
						rooms.push({ rid });
						this.internals.on(rid, roomEvent);
						break;

					case 'removed':
					case 'remove':
						this.internals.removeListener(rid, roomEvent);
						break;
				}
			};

			this.internals.on(uid, userEvent);
			publication.onStop(() => {
				this.internals.removeListener(uid, userEvent);
				rooms.forEach(({ rid }) => this.internals.removeListener(rid, roomEvent));
			});
			return publication.ready();
		}
		super.subscribe(publication, eventName, options);
	}
}

RocketChat.Notifications = new class {
	constructor() {
		this.debug = false;
		this.msgStream = new RoomMessage('room-messages');
		this.streamAll = new Stream('notify-all');
		this.streamLogged = new Stream('notify-logged');
		this.streamRoom = new Stream('notify-room');
		this.streamRoomUsers = new Stream('notify-room-users');
		this.streamUser = new NotifyUser('notify-user');
		this.streamAll.allowWrite('none');
		this.streamLogged.allowWrite('none');
		this.streamRoom.allowWrite('none');
		this.streamRoomUsers.allowWrite(function(eventName, ...args) {
			const [roomId, e] = eventName.split('/');
			// const user = Meteor.users.findOne(this.userId, {
			// 	fields: {
			// 		username: 1
			// 	}
			// });
			if (RocketChat.models.Subscriptions.findOneByRoomIdAndUserId(roomId, this.userId) != null) {
				const subscriptions = RocketChat.models.Subscriptions.findByRoomIdAndNotUserId(roomId, this.userId).fetch();
				subscriptions.forEach((subscription) => RocketChat.Notifications.notifyUser(subscription.u._id, e, ...args));
			}
			return false;
		});
		this.streamUser.allowWrite('none');
		this.streamAll.allowRead('all');
		this.streamLogged.allowRead('logged');
		this.streamRoom.allowRead(function(eventName, extraData) {
			const [roomId] = eventName.split('/');
			const room = RocketChat.models.Rooms.findOneById(roomId);
			if (!room) {
				console.warn(`Invalid streamRoom eventName: "${ eventName }"`);
				return false;
			}
			if (room.t === 'l' && extraData && extraData.token && room.v.token === extraData.token) {
				return true;
			}
			if (this.userId == null) {
				return false;
			}
			const subscription = RocketChat.models.Subscriptions.findOneByRoomIdAndUserId(roomId, this.userId, { fields: { _id: 1 } });
			return subscription != null;
		});
		this.streamRoomUsers.allowRead('none');
		this.streamUser.allowRead(function(eventName) {
			const [userId] = eventName.split('/');

			if (eventName === 'rooms-changed') {
				return this.userId != null;
			}
			return (this.userId != null) && this.userId === userId;
		});
	}

	notifyAll(eventName, ...args) {
		if (this.debug === true) {
			console.log('notifyAll', [eventName, ...args]);
		}
		args.unshift(eventName);
		Streamer.broadcast(this.streamAll.name, ...args);
		return this.streamAll.emit.apply(this.streamAll, args);
	}

	notifyLogged(eventName, ...args) {
		if (this.debug === true) {
			console.log('notifyLogged', [eventName, ...args]);
		}
		args.unshift(eventName);
		Streamer.broadcast(this.streamLogged.name, ...args);
		return this.streamLogged.emit.apply(this.streamLogged, args);
	}

	notifyRoom(room, eventName, ...args) {
		if (this.debug === true) {
			console.log('notifyRoom', [room, eventName, ...args]);
		}
		args.unshift(`${ room }/${ eventName }`);
		Streamer.broadcast(this.streamRoom.name, ...args);
		return this.streamRoom.emit.apply(this.streamRoom, args);
	}

	notifyUser(userId, eventName, ...args) {
		if (this.debug === true) {
			console.log('notifyUser', [userId, eventName, ...args]);
		}
		args.unshift(`${ userId }/${ eventName }`);
		Streamer.broadcast(this.streamUser.name, ...args);
		return this.streamUser.emit.apply(this.streamUser, args);
	}

	notifyAllInThisInstance(eventName, ...args) {
		if (this.debug === true) {
			console.log('notifyAll', [eventName, ...args]);
		}
		args.unshift(eventName);
		return this.streamAll.emit.apply(this.streamAll, args);
	}

	notifyLoggedInThisInstance(eventName, ...args) {
		if (this.debug === true) {
			console.log('notifyLogged', [eventName, ...args]);
		}
		args.unshift(eventName);
		return this.streamLogged.emit.apply(this.streamLogged, args);
	}

	notifyRoomInThisInstance(room, eventName, ...args) {
		if (this.debug === true) {
			console.log('notifyRoomAndBroadcast', [room, eventName, ...args]);
		}
		args.unshift(`${ room }/${ eventName }`);
		return this.streamRoom.emit.apply(this.streamRoom, args);
	}

	notifyUserInThisInstance(userId, eventName, ...args) {
		if (this.debug === true) {
			console.log('notifyUserAndBroadcast', [userId, eventName, ...args]);
		}
		args.unshift(`${ userId }/${ eventName }`);
		return this.streamUser.emit.apply(this.streamUser, args);
	}
};

RocketChat.Notifications.msgStream.allowRead(function(eventName, args) {
	try {
		const room = Meteor.call('canAccessRoom', eventName, this.userId, args);

		if (!room) {
			return false;
		}

		if (room.t === 'c' && !RocketChat.authz.hasPermission(this.userId, 'preview-c-room')) {
			return false;
		}

		return true;
	} catch (error) {
		/* error*/
		return false;
	}
});


const allowWrite = RocketChat.memoize(function(uid, eventName, username, extraData) {

	const [roomId, e] = eventName.split('/');

	if (e === 'webrtc') {
		return true;
	}

	if (e === 'typing') {
		const key = RocketChat.settings.get('UI_Use_Real_Name') ? 'name' : 'username';
		// typing from livechat widget
		if (extraData && extraData.token) {
			const room = RocketChat.models.Rooms.findOneById(roomId);
			if (room && room.t === 'l' && room.v.token === extraData.token) {
				return true;
			}
		}

		const user = Meteor.users.findOne(uid, {
			fields: {
				[key]: 1,
			},
		});

		if (!user) {
			return false;
		}

		return user[key] === username;
	}
	return false;
});

RocketChat.Notifications.streamRoom.allowWrite(function(eventName, username, typing, extraData = {}) { return allowWrite(this.userId, eventName, username, extraData); });
