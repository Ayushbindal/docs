import { Message } from '@rocket.chat/fuselage';
import React, { FC } from 'react';

import { useTranslation } from '../../../contexts/TranslationContext';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

type DicussionOptions = {
	drid: string;
	rid: string;
	openDiscussion: () => void;
	count: number;
	lm?: Date;
};

const DiscussionMetric: FC<DicussionOptions> = ({ lm, count, rid, drid, openDiscussion }) => {
	const t = useTranslation();
	const format = useTimeAgo();

	return (
		<Message.Block>
			<Message.Metrics>
				<Message.Metrics.Reply data-rid={rid} data-drid={drid} onClick={openDiscussion}>
					{count ? t('message_counter', { counter: count, count }) : t('Reply')}
				</Message.Metrics.Reply>
				<Message.Metrics.Item title={lm?.toLocaleString()}>
					<Message.Metrics.Item.Icon name='clock' />
					<Message.Metrics.Item.Label>
						{lm ? format(lm) : t('No_messages_yet')}
					</Message.Metrics.Item.Label>
				</Message.Metrics.Item>
			</Message.Metrics>
		</Message.Block>
	);
};

export default DiscussionMetric;
