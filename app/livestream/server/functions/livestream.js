import { google } from 'googleapis';

const { OAuth2 } = google.auth;

export const getBroadcastStatus = async ({
	id,
	access_token,
	refresh_token,
	clientId,
	clientSecret,
}) => {
	const auth = new OAuth2(clientId, clientSecret);

	auth.setCredentials({
		access_token,
		refresh_token,
	});

	const youtube = google.youtube({ version: 'v3', auth });
	const result = await youtube.liveBroadcasts.list({
		part: 'id,status',
		id,
	});
	return result.items?.[0]?.status.lifeCycleStatus;
};

export const statusStreamLiveStream = async ({
	id,
	access_token,
	refresh_token,
	clientId,
	clientSecret,
}) => {
	const auth = new OAuth2(clientId, clientSecret);

	auth.setCredentials({
		access_token,
		refresh_token,
	});

	const youtube = google.youtube({ version: 'v3', auth });
	const result = await youtube.liveStreams.list({
		part: 'id,status',
		id,
	});
	return result.items && result.items[0].status.streamStatus;
};

export const statusLiveStream = ({
	id,
	access_token,
	refresh_token,
	clientId,
	clientSecret,
	status,
}) => {
	const auth = new OAuth2(clientId, clientSecret);

	auth.setCredentials({
		access_token,
		refresh_token,
	});

	const youtube = google.youtube({ version: 'v3', auth });

	return youtube.liveBroadcasts.transition({
		part: 'id,status',
		id,
		broadcastStatus: status,
	});
};

export const setBroadcastStatus = ({
	id,
	access_token,
	refresh_token,
	clientId,
	clientSecret,
	status,
}) => {
	const auth = new OAuth2(clientId, clientSecret);

	auth.setCredentials({
		access_token,
		refresh_token,
	});

	const youtube = google.youtube({ version: 'v3', auth });

	return youtube.liveBroadcasts.transition({
		part: 'id,status',
		id,
		broadcastStatus: status,
	});
};

export const createLiveStream = async ({
	room,
	access_token,
	refresh_token,
	clientId,
	clientSecret,
}) => {
	const auth = new OAuth2(clientId, clientSecret);
	auth.setCredentials({
		access_token,
		refresh_token,
	});

	const youtube = google.youtube({ version: 'v3', auth });

	const stream = await youtube.liveStreams.insert({
		part: 'id,snippet,cdn,contentDetails,status',
		resource: {
			snippet: {
				title: room.name || 'RocketChat Broadcast',
			},
			cdn: {
				format: '480p',
				ingestionType: 'rtmp',
			},
		},
	});

	const broadcast = await youtube.liveBroadcasts.insert({
		part: 'id,snippet,contentDetails,status',
		resource: {
			snippet: {
				title: room.name || 'RocketChat Broadcast',
				scheduledStartTime: new Date().toISOString(),
			},
			status: {
				privacyStatus: 'unlisted',
			},
		},
	});

	await youtube.liveBroadcasts.bind({
		part: 'id,snippet,status',
		// resource: {
		id: broadcast.id,
		streamId: stream.id,
	});

	return { id: stream.cdn.ingestionInfo.streamName, stream, broadcast };
};
