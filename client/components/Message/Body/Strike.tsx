import { Strike as ASTStrike } from '@rocket.chat/message-parser';
import React, { FC } from 'react';

import Bold from './Bold';
import Italic from './Italic';

const Strike: FC<{ value: ASTStrike['value'] }> = ({ value = [] }) => (
	<del>
		{value.map((block, index) => {
			switch (block.type) {
				case 'PLAIN_TEXT':
					return block.value;
				case 'BOLD':
					return <Bold key={index} value={block.value} />;
				case 'ITALIC':
					return <Italic key={index} value={block.value} />;
				default:
					return null;
			}
		})}
	</del>
);

export default Strike;
