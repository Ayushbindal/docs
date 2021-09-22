import { Template } from 'meteor/templating';

import { APIClient } from '../../../utils';
import './Blocks.html';

Template.Blocks.events({
	async 'click button'() {
		console.log(await APIClient.post('api/apps/blockit/meu_app/outra_action'));
	},
});

Template.Blocks.helpers({
	template() {
		const { type } = this;
		console.log(type);
		switch (type) {
			case 'section':
				return 'SectionBlock';
			case 'divider':
				return 'DividerBlock';
			case 'image':
				return 'ImageBlock';
			case 'actions':
				return 'ActionsBlock';
		}
	},
	data() {
		const { type, ...data } = this;
		return data;
	},
});
