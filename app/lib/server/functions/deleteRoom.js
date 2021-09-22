import { Messages, Subscriptions, Rooms } from '/app/models';
import { callbacks } from '/app/callbacks';
export const deleteRoom = function(rid) {
	Messages.removeFilesByRoomId(rid);
	Messages.removeByRoomId(rid);
	Subscriptions.removeByRoomId(rid);
	callbacks.run('afterDeleteRoom', rid);
	return Rooms.removeById(rid);
};
