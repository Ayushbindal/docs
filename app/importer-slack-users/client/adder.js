import { Importers } from '../../importer/client';
import { ImporterInfo } from '../../../common/importer/ImporterInfo';

class SlackUsersImporterInfo extends ImporterInfo {
	constructor() {
		super('slack-users', 'Slack_Users', 'text/csv', [{
			text: 'Importer_Slack_Users_CSV_Information',
			href: 'https://rocket.chat/docs/administrator-guides/import/slack/users',
		}]);
	}
}

Importers.add(new SlackUsersImporterInfo());
