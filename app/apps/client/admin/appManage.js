import { Meteor } from 'meteor/meteor';
import { ReactiveDict } from 'meteor/reactive-dict';
import { ReactiveVar } from 'meteor/reactive-var';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { Template } from 'meteor/templating';
import { TAPi18n, TAPi18next } from 'meteor/tap:i18n';
import { Tracker } from 'meteor/tracker';
import _ from 'underscore';
import s from 'underscore.string';
import toastr from 'toastr';
import semver from 'semver';

import { isEmail, t, APIClient } from '../../../utils';
import { Markdown } from '../../../markdown/client';
import { modal } from '../../../ui-utils';
import { AppEvents } from '../communication';
import { Utilities } from '../../lib/misc/Utilities';
import { Apps } from '../orchestrator';
import { SideNav, popover } from '../../../ui-utils/client';
import {
	formatPrice,
	formatPricingPlan,
	handleAPIError,
	triggerButtonLoadingState,
} from './helpers';

import './appManage.html';
import './appManage.css';


const getApp = (instance) => {
	const id = instance.id.get();

	const appInfo = { remote: undefined, local: undefined };
	return APIClient.get(`apps/${ id }?marketplace=true&version=${ FlowRouter.getQueryParam('version') }`)
		.catch((e) => {
			console.log(e);
			toastr.error((e.xhr.responseJSON && e.xhr.responseJSON.error) || e.message);
			return { app: undefined };
		})
		.then((remote) => {
			if (!remote.app || !remote.app.bundledIn || remote.app.bundledIn.length === 0) {
				return remote;
			}

			const requests = remote.app.bundledIn.map((bundledIn) => {
				const request = APIClient.get(`apps/bundles/${ bundledIn.bundleId }/apps`);

				return request
					.catch((e) => {
						console.log(e);
						return remote;
					}).then((data) => {
						bundledIn.apps = data && data.apps.splice(0, 4);
						return remote;
					});
			});

			return Promise.all(requests).then(() => remote);
		})
		.then((remote) => {
			appInfo.remote = remote.app;
			return APIClient.get(`apps/${ id }`);
		})
		.then((local) => {
			appInfo.local = local.app;
			return Apps.getAppApis(id);
		})
		.then((apis) => instance.apis.set(apis))
		.catch((e) => {
			if (appInfo.remote || appInfo.local) {
				return true;
			}

			instance.error.set(e.message);
		}).then((goOn) => {
			if (typeof goOn !== 'undefined' && !goOn) {
				return;
			}

			if (appInfo.remote) {
				appInfo.remote.displayPrice = parseFloat(appInfo.remote.price).toFixed(2);
			}

			if (appInfo.local) {
				appInfo.local.installed = true;

				if (appInfo.remote) {
					appInfo.local.categories = appInfo.remote.categories;
					appInfo.local.isPurchased = appInfo.remote.isPurchased;
					appInfo.local.price = appInfo.remote.price;
					appInfo.local.displayPrice = appInfo.remote.displayPrice;
					appInfo.local.bundledIn = appInfo.remote.bundledIn;
					appInfo.local.purchaseType = appInfo.remote.purchaseType;
					appInfo.local.subscriptionInfo = appInfo.remote.subscriptionInfo;

					if (semver.gt(appInfo.remote.version, appInfo.local.version) && (appInfo.remote.isPurchased || appInfo.remote.price <= 0)) {
						appInfo.local.newVersion = appInfo.remote.version;
					}
				}

				instance.onSettingUpdated({ appId: id });

				Apps.getWsListener().unregisterListener(AppEvents.APP_STATUS_CHANGE, instance.onStatusChanged);
				Apps.getWsListener().unregisterListener(AppEvents.APP_SETTING_UPDATED, instance.onSettingUpdated);
				Apps.getWsListener().registerListener(AppEvents.APP_STATUS_CHANGE, instance.onStatusChanged);
				Apps.getWsListener().registerListener(AppEvents.APP_SETTING_UPDATED, instance.onSettingUpdated);
			}

			instance.app.set(appInfo.local || appInfo.remote);
			instance.ready.set(true);

			if (appInfo.remote && appInfo.local) {
				try {
					return APIClient.get(`apps/${ id }?marketplace=true&update=true&appVersion=${ FlowRouter.getQueryParam('version') }`);
				} catch (e) {
					toastr.error((e.xhr.responseJSON && e.xhr.responseJSON.error) || e.message);
				}
			}

			return false;
		}).then((updateInfo) => {
			if (!updateInfo) {
				return;
			}

			const update = updateInfo.app;

			if (semver.gt(update.version, appInfo.local.version) && (update.isPurchased || update.price <= 0)) {
				appInfo.local.newVersion = update.version;

				instance.app.set(appInfo.local);
			}
		});
};

const promptModifySubscription = async (app, instance) => {
	let data = null;
	try {
		data = await Apps.buildExternalUrl(app.id, app.purchaseType, true);
	} catch (e) {
		handleAPIError(e, instance);
		return;
	}

	modal.open({
		allowOutsideClick: false,
		data,
		template: 'iframeModal',
	}, async () => {
		try {
			await APIClient.post(`apps/${ app.id }/sync`, {});
			await getApp(instance);
		} catch (error) {
			handleAPIError(error);
		}
	});
};

const setAppStatus = async (app, status, instance) => {
	try {
		app.status = await Apps.setAppStatus(app.id, status);
		instance.app.set(app);
	} catch (error) {
		handleAPIError(error);
	}
};

const activateApp = (app, instance) => {
	setAppStatus(app, 'manually_enabled', instance);
};

const promptAppDeactivation = (app, instance) => {
	modal.open({
		text: t('Apps_Marketplace_Deactivate_App_Prompt'),
		type: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#DD6B55',
		confirmButtonText: t('Yes'),
		cancelButtonText: t('No'),
		closeOnConfirm: true,
		html: false,
	}, (confirmed) => {
		if (!confirmed) {
			return;
		}
		setAppStatus(app, 'manually_disabled', instance);
	});
};

const uninstallApp = async ({ id }, instance) => {
	try {
		await Apps.uninstallApp(id);
	} catch (e) {
		handleAPIError(e, instance);
	}

	try {
		await getApp(instance);
	} catch (error) {
		handleAPIError(error, instance);
	}
};

const promptAppUninstall = (app, instance) => {
	modal.open({
		text: t('Apps_Marketplace_Uninstall_App_Prompt'),
		type: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#DD6B55',
		confirmButtonText: t('Yes'),
		cancelButtonText: t('No'),
		closeOnConfirm: true,
		html: false,
	}, (confirmed) => {
		if (!confirmed) {
			return;
		}
		uninstallApp(app, instance);
	});
};

Template.appManage.onCreated(function() {
	this.state = new ReactiveDict({
		app: {
			id: FlowRouter.getParam('appId'),
		},
	});

	this.id = new ReactiveVar(FlowRouter.getParam('appId'));
	this.ready = new ReactiveVar(false);
	this.error = new ReactiveVar('');
	this.app = new ReactiveVar({});
	this.appsList = new ReactiveVar([]);
	this.settings = new ReactiveVar({});
	this.apis = new ReactiveVar([]);
	this.loading = new ReactiveVar(false);

	const id = this.id.get();
	getApp(this);

	this.__ = (key, options, lang_tag) => {
		const appKey = Utilities.getI18nKeyForApp(key, id);
		return TAPi18next.exists(`project:${ appKey }`) ? TAPi18n.__(appKey, options, lang_tag) : TAPi18n.__(key, options, lang_tag);
	};

	this.onStatusChanged = ({ appId, status }) => {
		if (appId !== id) {
			return;
		}

		const app = this.app.get();
		app.status = status;
		this.app.set(app);
	};

	this.onSettingUpdated = async ({ appId }) => {
		if (appId !== id) {
			return;
		}

		const settings = await Apps.getAppSettings(id);
		for (const setting of Object.values(settings)) {
			setting.i18nPlaceholder = setting.i18nPlaceholder || ' ';
			setting.value = setting.value !== undefined && setting.value !== null ? setting.value : setting.packageValue;
			setting.oldValue = setting.value;
			setting.hasChanged = false;
		}

		this.settings.set(settings);
	};

	this.handleAppAdded = async (appId) => {
		if (appId !== this.id.get()) {
			return;
		}

		try {
			await getApp(this);
		} catch (e) {
			handleAPIError(e, this);
		}
	};

	this.handleAppRemoved = async (appId) => {
		if (appId !== this.id.get()) {
			return;
		}

		try {
			await getApp(this);
		} catch (e) {
			handleAPIError(e, this);
		}
	};

	Apps.getWsListener().registerListener(AppEvents.APP_ADDED, this.handleAppAdded);
	Apps.getWsListener().registerListener(AppEvents.APP_REMOVED, this.handleAppRemoved);
});

Template.apps.onDestroyed(function() {
	Apps.getWsListener().unregisterListener(AppEvents.APP_STATUS_CHANGE, this.onStatusChanged);
	Apps.getWsListener().unregisterListener(AppEvents.APP_SETTING_UPDATED, this.onSettingUpdated);
	Apps.getWsListener().unregisterListener(AppEvents.APP_ADDED, this.handleAppAdded);
	Apps.getWsListener().unregisterListener(AppEvents.APP_REMOVED, this.handleAppRemoved);
});

Template.appManage.onRendered(() => {
	Tracker.afterFlush(() => {
		SideNav.setFlex('adminFlex');
		SideNav.openFlex();
	});
});

Template.appManage.helpers({
	isSettingsPristine() {
		const settings = Template.instance().settings.get();
		return !Object.values(settings).some(({ hasChanged }) => hasChanged);
	},
	isInstalled() {
		const app = Template.instance().app.get();
		return app.installed;
	},
	canUpdate() {
		const app = Template.instance().app.get();
		return app.installed && app.newVersion;
	},
	isFromMarketplace() {
		const app = Template.instance().app.get();
		return app.subscriptionInfo;
	},
	canTrial() {
		const app = Template.instance().app.get();
		return app.purchaseType === 'subscription' && app.subscriptionInfo && !app.subscriptionInfo.status;
	},
	canBuy() {
		const app = Template.instance().app.get();
		return app.price > 0;
	},
	priceDisplay() {
		const app = Template.instance().app.get();
		if (app.purchaseType === 'subscription') {
			if (!app.pricingPlans || !Array.isArray(app.pricingPlans) || app.pricingPlans.length === 0) {
				return;
			}

			return formatPricingPlan(app.pricingPlans[0]);
		}

		if (app.price > 0) {
			return formatPrice(app.price);
		}

		return 'Free';
	},
	isEmail,
	_(key, ...args) {
		const options = args.pop().hash;
		if (!_.isEmpty(args)) {
			options.sprintf = args;
		}

		return Template.instance().__(key, options);
	},
	languages() {
		const languages = TAPi18n.getLanguages();

		let result = Object.keys(languages).map((key) => {
			const language = languages[key];
			return _.extend(language, { key });
		});

		result = _.sortBy(result, 'key');
		result.unshift({
			name: 'Default',
			en: 'Default',
			key: '',
		});
		return result;
	},
	selectedOption(_id, val) {
		const settings = Template.instance().settings.get();
		return settings[_id].value === val;
	},
	isReady() {
		if (Template.instance().ready) {
			return Template.instance().ready.get();
		}

		return false;
	},
	error() {
		if (Template.instance().error) {
			return Template.instance().error.get();
		}

		return '';
	},
	app() {
		return Template.instance().app.get();
	},
	categories() {
		return Template.instance().app.get().categories;
	},
	settings() {
		return Object.values(Template.instance().settings.get());
	},
	apis() {
		return Template.instance().apis.get();
	},
	parseDescription(i18nDescription) {
		const item = Markdown.parseMessageNotEscaped({ html: Template.instance().__(i18nDescription) });

		item.tokens.forEach((t) => { item.html = item.html.replace(t.token, t.text); });

		return item.html;
	},
	saving() {
		return Template.instance().loading.get();
	},
	curl(method, api) {
		const example = api.examples[method] || {};
		return Utilities.curl({
			url: Meteor.absoluteUrl.defaultOptions.rootUrl + api.computedPath,
			method,
			params: example.params,
			query: example.query,
			content: example.content,
			headers: example.headers,
		}).split('\n');
	},
	renderMethods(methods) {
		return methods.join('|').toUpperCase();
	},
	bundleAppNames(apps) {
		return apps.map((app) => app.latest.name).join(', ');
	},
});

Template.appManage.events({
	'click .js-cancel-editing-settings'(event, instance) {
		const settings = instance.settings.get();

		for (const setting of Object.values(settings)) {
			setting.value = setting.oldValue;
			setting.hasChanged = false;
		}

		instance.settings.set(settings);
	},

	'click .js-save-settings': async (e, t) => {
		if (t.loading.get()) {
			return;
		}
		t.loading.set(true);
		const settings = t.settings.get();


		try {
			const toSave = [];
			Object.keys(settings).forEach((k) => {
				const setting = settings[k];
				if (setting.hasChanged) {
					toSave.push(setting);
				}
			});

			if (toSave.length === 0) {
				throw new Error('Nothing to save..');
			}
			const updated = await Apps.setAppSettings(t.id.get(), toSave);
			updated.forEach(({ id, value }) => {
				settings[id].value = value;
				settings[id].oldValue = value;
			});
			Object.values(settings).forEach((setting) => {
				setting.hasChanged = false;
			});
			t.settings.set(settings);
		} catch (e) {
			console.log(e);
		} finally {
			t.loading.set(false);
		}
	},
	'click .js-close'() {
		window.history.back();
	},
	'click .js-menu'(e, instance) {
		e.stopPropagation();
		const { currentTarget } = e;

		const app = instance.app.get();
		const isActive = app && ['auto_enabled', 'manually_enabled'].includes(app.status);

		popover.open({
			currentTarget,
			instance,
			columns: [{
				groups: [
					{
						items: [
							...this.purchaseType === 'subscription' ? [{
								icon: 'card',
								name: t('Subscription'),
								action: () => promptModifySubscription(this, instance),
							}] : [],
							{
								icon: 'list-alt',
								name: t('View_Logs'),
								action: () => {
									FlowRouter.go(`/admin/apps/${ app.id }/logs`, {}, { version: FlowRouter.getQueryParam('version') });
								},
							},
						],
					},
					{
						items: [
							isActive
								? {
									icon: 'ban',
									name: t('Deactivate'),
									modifier: 'alert',
									action: () => promptAppDeactivation(app, instance),
								}
								: {
									icon: 'check',
									name: t('Activate'),
									action: () => activateApp(app, instance),
								},
							{
								icon: 'trash',
								name: t('Uninstall'),
								modifier: 'alert',
								action: () => promptAppUninstall(app, instance),
							},
						],
					},
				],
			}],
		});
	},

	async 'click .js-install'(e, instance) {
		e.stopPropagation();

		const { currentTarget: button } = e;
		const stopLoading = triggerButtonLoadingState(button);

		const { id, version } = instance.app.get();

		try {
			await APIClient.post('apps/', {
				appId: id,
				marketplace: true,
				version,
			});
		} catch (e) {
			handleAPIError(e, instance);
		}

		try {
			await getApp(instance);
		} catch (e) {
			handleAPIError(e, instance);
		} finally {
			stopLoading();
		}
	},

	async 'click .js-purchase'(e, instance) {
		const { id, purchaseType = 'buy', version } = instance.app.get();
		const { currentTarget: button } = e;
		const stopLoading = triggerButtonLoadingState(button);

		let data = null;
		try {
			data = await APIClient.get(`apps?buildExternalUrl=true&appId=${ id }&purchaseType=${ purchaseType }`);
		} catch (e) {
			handleAPIError(e, instance);
			stopLoading();
			return;
		}

		modal.open({
			allowOutsideClick: false,
			data,
			template: 'iframeModal',
		}, async () => {
			try {
				await APIClient.post('apps/', {
					appId: id,
					marketplace: true,
					version,
				});
			} catch (e) {
				handleAPIError(e, instance);
			}

			try {
				await getApp(instance);
			} catch (e) {
				handleAPIError(e, instance);
			} finally {
				stopLoading();
			}
		}, stopLoading);
	},

	'change input[type="checkbox"]': (e, t) => {
		const labelFor = $(e.currentTarget).attr('name');
		const isChecked = $(e.currentTarget).prop('checked');

		// $(`input[name="${ labelFor }"]`).prop('checked', !isChecked);

		const setting = t.settings.get()[labelFor];

		if (setting) {
			setting.value = isChecked;
			t.settings.get()[labelFor].hasChanged = setting.oldValue !== setting.value;
			t.settings.set(t.settings.get());
		}
	},

	'change .rc-select__element': (e, t) => {
		const labelFor = $(e.currentTarget).attr('name');
		const value = $(e.currentTarget).val();

		const setting = t.settings.get()[labelFor];

		if (setting) {
			setting.value = value;
			t.settings.get()[labelFor].hasChanged = setting.oldValue !== setting.value;
			t.settings.set(t.settings.get());
		}
	},

	'input input, input textarea, change input[type="color"]': _.throttle(function(e, t) {
		let value = s.trim($(e.target).val());

		switch (this.type) {
			case 'int':
				value = parseInt(value);
				break;
			case 'boolean':
				value = value === '1';
				break;
			case 'code':
				value = $(`.code-mirror-box[data-editor-id="${ this.id }"] .CodeMirror`)[0].CodeMirror.getValue();
		}

		const setting = t.settings.get()[this.id];

		if (setting) {
			setting.value = value;

			if (setting.oldValue !== setting.value) {
				t.settings.get()[this.id].hasChanged = true;
				t.settings.set(t.settings.get());
			}
		}
	}, 500),
});
