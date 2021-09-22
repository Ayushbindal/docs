import _ from 'lodash';
import { SHA256 } from 'meteor/sha';
import deepMapKeys from 'deep-map-keys';
import { EJSON } from 'meteor/ejson';
import { Random } from 'meteor/random';

import { IEventDataUpdate } from '../../../events/definitions/data/IEventDataUpdate';
import { EventContext, EventTypeDescriptor, EventDataDefinition, IEventData, IEvent } from '../../../events/definitions/IEvent';
import { RoomEventTypeDescriptor } from '../../../events/definitions/room/IRoomEvent';
import { Base } from './_Base';

export declare interface IContextQuery { ct: EventContext; cid: string }
export declare interface IAddEventResult { success: boolean; reason?: string; missingParentIds?: Array<string>; latestEventIds?: Array<string> }
export declare interface IEventStub<T extends EventDataDefinition> { clid?: string; t: EventTypeDescriptor; d: T }

export declare type IEventDataHashOption = {
	include?: Array<string>;
	skip?: Array<string>;
}
export declare type IEventDataHashOptions = {
	[key in EventTypeDescriptor]?: IEventDataHashOption;
}
export declare type IEventDataHashOptionsDef = {
	t: Array<EventTypeDescriptor>;
	options: IEventDataHashOption;
};

export class EventsModel extends Base<IEvent<EventDataDefinition>> {
	readonly dataHashOptionsDefinition: Array<IEventDataHashOptionsDef> = [
		{
			t: [RoomEventTypeDescriptor.MESSAGE, RoomEventTypeDescriptor.EDIT_MESSAGE],
			options: {
				include: ['t', 'u', 'msg'],
			},
		},
	];

	readonly dataHashOptions: IEventDataHashOptions;

	constructor(nameOrModel: string) {
		super(nameOrModel);

		this.tryEnsureIndex({ ct: 1 });
		this.tryEnsureIndex({ ct: 1, cid: 1 });
		this.tryEnsureIndex({ ct: 1, cid: 1, ts: 1 });
		this.tryEnsureIndex({ ts: 1 });
		this.tryEnsureIndex({ isLeaf: 1 }, { sparse: true });

		this.dataHashOptions = this.dataHashOptionsDefinition.reduce((acc, item) => {
			for (const t of item.t) {
				acc[t] = item.options;
			}

			return acc;
		}, {} as IEventDataHashOptions);
	}

	public getEventIdHash<T extends EventDataDefinition>(contextQuery: IContextQuery, event: IEvent<T>): string {
		if (process.env.DISABLE_ID_SHA === '1') { return process.hrtime().toString(); }

		return SHA256(`${ event.src }${ JSON.stringify(contextQuery) }${ event.pids.join(',') }${ event.t }${ event.ts }${ event.dHash }`);
	}

	public getEventDataHash<T extends EventDataDefinition>(event: IEvent<T>): string {
		if (process.env.DISABLE_DATA_SHA === '1') { return process.hrtime().toString(); }

		// Always use the consolidated (o), unchanged data
		let data: any = event.o;

		const options: any = this.dataHashOptions[event.t];

		if (options) {
			if (options.include) { data = _.pick(data, options.include); }
			if (options.skip) { data = _.omit(data, options.skip); }
		}

		return SHA256(JSON.stringify(data));
	}

	public async createEvent<T extends EventDataDefinition>(src: string, contextQuery: IContextQuery, stub: IEventStub<T>, counter: number): Promise<IEvent<T>> {
		// Get the previous events
		let pids = []; // Previous ids
		let previousEvents = [];

		console.time(`[${ counter }] leafSearch`);
		if (process.env.DISABLE_LEAF_SEARCH === '1') {
			previousEvents = [process.hrtime().toString()];
		} else {
			previousEvents = await this.model
				.rawCollection()
				.find({ ...contextQuery, isLeaf: true })
				.toArray();
		}
		console.timeEnd(`[${ counter }] leafSearch`);

		console.time(`[${ counter }] map`);
		pids = previousEvents.map((e: IEvent<any>) => e._id);

		const event: IEvent<T> = {
			_id: '',
			clid: stub.clid,
			pids: pids || [],
			v: 2,
			ts: new Date(),
			src,
			...contextQuery,
			t: stub.t,
			dHash: '',
			o: stub.d,
			d: stub.d,
			isLeaf: true,
		};
		console.timeEnd(`[${ counter }] map`);

		//
		// Create the data hash
		console.time(`[${ counter }] getEventDataHash`);
		event.dHash = this.getEventDataHash(event);
		console.timeEnd(`[${ counter }] getEventDataHash`);

		//
		// Create ID hash
		console.time(`[${ counter }] getEventIdHash`);
		event._id = this.getEventIdHash(contextQuery, event);
		console.timeEnd(`[${ counter }] getEventIdHash`);

		return event;
	}

	public async createGenesisEvent<T extends EventDataDefinition>(src: string, contextQuery: IContextQuery, t: EventTypeDescriptor, d: T): Promise<IEvent<T>> {
		// Check if genesis event already exists, if so, do not create
		const genesisEvent = await this.model
			.rawCollection()
			.findOne({ ...contextQuery, t });

		if (genesisEvent) {
			throw new Error(`A GENESIS event for this context query already exists: ${ JSON.stringify(contextQuery, null, 2) }`);
		}

		const stub: IEventStub<T> = {
			t,
			d,
		};

		return this.createEvent(src, contextQuery, stub, 0);
	}

	public async 	addEvent<T extends EventDataDefinition>(contextQuery: IContextQuery, event: IEvent<T>, counter: number): Promise<IAddEventResult> {
		// console.time(`[${ counter }] findOne`);
		// // Check if the event does not exit
		// const existingEvent = this.findOne({ _id: event._id });
		// console.timeEnd(`[${ counter }] findOne`);
		//
		// // If it does not, we insert it, checking for the parents
		// if (!existingEvent) {
		// 	if (process.env.DISABLE_LEAF_SEARCH !== '1') {
		// 		// Check if we have the parents
		// 		console.time(`[${ counter }] findLeaf`);
		// 		const parents: Array<IEvent<any>> = await this.model.rawCollection().find({
		// 			...contextQuery,
		// 			_id: { $in: event.pids },
		// 		}, { _id: 1 }).toArray();
		// 		console.timeEnd(`[${ counter }] findLeaf`);
		// 		const pids: Array<string> = parents.map((e: IEvent<any>) => e._id);
		//
		// 		// This means that we do not have the parents of the event we are adding
		// 		if (pids.length !== event.pids.length) {
		// 			const { src } = event;
		//
		// 			// Get the latest events for that context and src
		// 			console.time(`[${ counter }] findLatest`);
		// 			const latestEvents = await this.model.rawCollection().find({
		// 				...contextQuery,
		// 				src,
		// 			}, { _id: 1 }).toArray();
		// 			console.timeEnd(`[${ counter }] findLatest`);
		// 			const latestEventIds = latestEvents.map((e: IEvent<any>) => e._id);
		//
		// 			return {
		// 				success: false,
		// 				reason: 'missingParents',
		// 				missingParentIds: event.pids.filter((_id) => pids.indexOf(_id) === -1),
		// 				latestEventIds,
		// 			};
		// 		}
		//
		// 		// Clear the "isLeaf" of the parent events
		// 		console.time(`[${ counter }] update`);
		// 		await this.update({ _id: { $in: pids } }, { $unset: { isLeaf: 1 } }, { multi: 1 });
		// 		console.timeEnd(`[${ counter }] update`);
		// 	}
		//
		// 	console.time(`[${ counter }] insert`);
		// 	this.insert(event, counter);
		// 	console.timeEnd(`[${ counter }] insert`);
		// }

		console.time(`[${ counter }] insert`);
		this.insert(event, counter);
		console.timeEnd(`[${ counter }] insert`);

		return {
			success: true,
		};
	}

	private async getExistingEvent(contextQuery: IContextQuery, eventT: string, eventCID?: string): Promise<IEvent<any>> {
		const query: any = { ...contextQuery, t: eventT.substr(1) };

		if (eventCID) {
			query.clid = eventCID;
		}

		return this.model.rawCollection().findOne(query);
	}

	public async updateEventData<T extends IEventData>(contextQuery: IContextQuery, eventT: string, updateData: IEventDataUpdate<T>, eventCID?: string): Promise<void> {
		const existingEvent = await this.getExistingEvent(contextQuery, eventT, eventCID);

		const updateQuery: any = EJSON.fromJSONValue(deepMapKeys(updateData, (k: any) => k.replace('[csg]', '$').replace('[dot]', '.')));

		for (const prop in updateQuery) {
			if (prop.startsWith('$')) {
				updateQuery[prop] = _.mapKeys(updateQuery[prop], (_value: any, key: any) => (key.startsWith('$') ? key : `d.${ key }`));
			}
		}

		await this.model.rawCollection().update({ _id: existingEvent._id }, updateQuery);
	}

	public async flagEventAsDeleted(contextQuery: IContextQuery, eventT: string, deletedAt: Date, eventCID?: string): Promise<void> {
		const existingEvent = await this.getExistingEvent(contextQuery, eventT, eventCID);

		await this.model.rawCollection().update({ _id: existingEvent._id }, {
			$set: {
				deletedAt,
			},
		});
	}

	// Overrides

	setUpdatedAt(record: any = {}): any {
		if (/(^|,)\$/.test(Object.keys(record).join(','))) {
			record.$set = record.$set || {};
			record.$set.updatedAt = new Date();
		} else {
			record.updatedAt = new Date();
		}

		return record;
	}

	insert(record: any, counter: number): any {
		console.time(`[${ counter }] setUpdatedAt`);
		this.setUpdatedAt(record);
		console.timeEnd(`[${ counter }] setUpdatedAt`);

		console.time(`[${ counter }] superInsert`);
		const result = super.insert(record, { skipUpdatedAt: true });
		console.timeEnd(`[${ counter }] superInsert`);

		return result;
	}

	update(query: any, update: any, options: any = {}) {
		this.setUpdatedAt(update);

		options.skipUpdatedAt = true;

		return super.update(query, update, options);
	}

	// ^^ Overrides ^^
}
