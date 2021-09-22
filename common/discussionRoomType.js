import { RoomTypeConfig, roomTypes } from '../app/utils';

export class DiscussionRoomType extends RoomTypeConfig {
	constructor() {
		super({
			identifier: 't',
			order: 25,
			label: 'Discussion',
		});
	}
}

roomTypes.add(new DiscussionRoomType());
