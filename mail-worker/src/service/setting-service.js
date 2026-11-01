import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import {normalizeFilterRules} from '../utils/filter-rules';

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		settingRow.oidcProviders = this.parseOidcProviders(settingRow);
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	// OIDC 服务商列表：新字段是 JSON 数组；老库只有单条 oidc_* 字段时自动兜底，
	// 保证升级用户原来的 SSO 配置不会消失。
	parseOidcProviders(row) {
		let list = row.oidcProviders;
		if (typeof list === 'string') {
			try {
				list = JSON.parse(list);
			} catch (e) {
				list = [];
			}
		}
		if (!Array.isArray(list)) list = [];
		list = list.filter(item => item && item.issuer && item.clientId);
		if (list.length === 0 && row.oidcIssuer && row.oidcClientId) {
			list = [{
				id: 'legacy',
				name: row.oidcName || 'SSO',
				issuer: row.oidcIssuer,
				clientId: row.oidcClientId,
				clientSecret: row.oidcClientSecret || '',
				scope: row.oidcScope || 'openid profile email',
				callbackUrl: row.oidcCallbackUrl || '',
				enabled: row.oidcSwitch === 1
			}];
		}
		return list;
	},

	// 从聊天/文档复制 URL 时常带 `https\://` 转义，统一还原后再存/下发
	normalizeIcon(icon) {
		return String(icon || '').replace(/\\\//g, '/').replace(/\\:/g, ':').trim().slice(0, 300);
	},

	// 后台读：secret 不下发，只给 hasSecret；列表顺序即登录页按钮顺序
	publicOidcProviders(row) {
		return this.parseOidcProviders(row).map(item => ({
			id: item.id,
			name: item.name || 'SSO',
			icon: this.normalizeIcon(item.icon),
			issuer: item.issuer || '',
			clientId: item.clientId || '',
			scope: item.scope || 'openid profile email',
			callbackUrl: item.callbackUrl || '',
			enabled: item.enabled === true || item.enabled === 1,
			hasSecret: !!item.clientSecret
		}));
	},

	enabledOidcProviders(row) {
		return this.publicOidcProviders(row).filter(item => item.enabled);
	},

	// OIDC 登录/绑定入口按 id 取服务商；未传 id 时取第一个启用的
	async resolveOidcProvider(c, providerId) {
		const row = await this.query(c);
		const list = this.enabledOidcProviders(row);
		const provider = providerId
			? list.find(item => item.id === providerId)
			: list[0];
		if (!provider) {
			throw new BizError(t('oidcNotConfigured') || 'OIDC not configured');
		}
		// 内部调用需要 secret，重新从完整列表里取
		const full = this.parseOidcProviders(row).find(item => item.id === provider.id);
		return { ...provider, clientSecret: full?.clientSecret || '' };
	},

	async query(c) {

		if (c.get?.('setting')) {
			const cached = c.get('setting');
			cached.oidcProviders = this.parseOidcProviders(cached);
			return cached;
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;


		let linuxdoSwitch = c.env.linuxdo_switch;
		let githubSwitch = c.env.github_switch;
		let googleSwitch = c.env.google_switch;
		let projectLink = c.env.project_link;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true
		} else {
			linuxdoSwitch = false
		}

		// N-01 github_switch：同 linuxdo_switch 语义，需字符串容错（--var 注入为 "true"）
		if (typeof githubSwitch === 'string' && githubSwitch === 'true') {
			githubSwitch = true
		} else if (githubSwitch === true) {
			githubSwitch = true
		} else {
			githubSwitch = false
		}

		// N-01 google_switch：同 github_switch 语义，需字符串容错
		if (typeof googleSwitch === 'string' && googleSwitch === 'true') {
			googleSwitch = true
		} else if (googleSwitch === true) {
			googleSwitch = true
		} else {
			googleSwitch = false
		}

		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;

		setting.linuxdoClientId = c.env.linuxdo_client_id;
		setting.linuxdoCallbackUrl = c.env.linuxdo_callback_url;
		setting.linuxdoSwitch = linuxdoSwitch;

		setting.githubClientId = c.env.github_client_id;
		setting.githubCallbackUrl = c.env.github_callback_url;
		setting.githubSwitch = githubSwitch;

		setting.googleClientId = c.env.google_client_id;
		setting.googleCallbackUrl = c.env.google_callback_url;
		setting.googleSwitch = googleSwitch;

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);
		setting.oidcProviders = this.parseOidcProviders(setting);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		// AI API Key 只回显前 8 位，后台保存时靠 ****** 判断未修改
		settingRow.aiApiKey = settingRow.aiApiKey ? `${settingRow.aiApiKey.slice(0, 8)}******` : '';
		// DeepL key 脱敏：仅回显前 8 位，避免设置页明文泄露
		settingRow.deeplKey = settingRow.deeplKey ? `${settingRow.deeplKey.slice(0, 8)}******` : '';
		// OIDC client_secret 同样脱敏，避免后台接口明文回显
		settingRow.oidcClientSecret = settingRow.oidcClientSecret ? `${settingRow.oidcClientSecret.slice(0, 6)}******` : '';
		settingRow.oidcProviders = this.publicOidcProviders(settingRow);
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		if (params.chatOpacity !== undefined) {
			params.chatOpacity = Math.min(1, Math.max(0, Number(params.chatOpacity) || 0));
		}
		if (params.showAvatar !== undefined) {
			params.showAvatar = Number(params.showAvatar) === 0 ? 0 : 1;
		}

		if (params.subtitle !== undefined) {
			params.subtitle = String(params.subtitle || '').slice(0, 80);
		}

		if (params.emailFilters !== undefined) {
			params.emailFilters = JSON.stringify(normalizeFilterRules(params.emailFilters));
		}

		if (params.aiClassifyMode !== undefined) {
			const modes = ['off', 'auto', 'manual'];
			if (!modes.includes(params.aiClassifyMode)) {
				throw new BizError('Invalid AI classify mode', 400);
			}
		}
		if (params.aiSummaryMode !== undefined && !['manual', 'auto'].includes(params.aiSummaryMode)) {
			throw new BizError('Invalid AI summary mode', 400);
		}

		// 脱敏字段：前端回传含 ****** 的占位值说明未修改，剔除以免覆盖真实 key
		['deeplKey', 'secretKey', 'tgBotToken', 's3AccessKey', 's3SecretKey', 'oidcClientSecret', 'aiApiKey'].forEach(k => {
			if (typeof params[k] === 'string' && params[k].includes('******')) delete params[k];
		});

		// 多 OIDC：前端只回传 hasSecret，不回传明文 secret。按 id 合并旧 secret；
		// 新服务商留空就是空 secret（不允许把上一家的 secret 串到新服务商）。
		if (params.oidcProviders !== undefined) {
			const oldList = this.parseOidcProviders(settingData);
			let list = params.oidcProviders;
			if (typeof list === 'string') {
				try { list = JSON.parse(list); } catch (e) { list = []; }
			}
			if (!Array.isArray(list)) list = [];
			params.oidcProviders = JSON.stringify(list
				.filter(item => item && item.issuer && item.clientId)
				.map((item, index) => {
					const old = oldList.find(row => row.id === item.id);
					let id = String(item.id || '').trim();
					if (!id) id = 'oidc-' + Date.now().toString(36) + '-' + index;
					let secret = typeof item.clientSecret === 'string' ? item.clientSecret : '';
					if (!secret || secret.includes('******')) secret = old?.clientSecret || '';
					return {
						id,
						name: String(item.name || 'SSO').slice(0, 60),
						icon: this.normalizeIcon(item.icon),
						issuer: String(item.issuer || '').trim().replace(/\/+$/, ''),
						clientId: String(item.clientId || '').trim(),
						clientSecret: secret,
						scope: String(item.scope || 'openid profile email').trim(),
						callbackUrl: String(item.callbackUrl || '').trim(),
						enabled: item.enabled === true || item.enabled === 1
					};
				}));
		}

		params.resendTokens = JSON.stringify(resendTokens);
		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c, target = 'background') {

		const key = target === 'chatBackground' ? 'chatBackground' : 'background';
		const { [key]: background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ [key]: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ [key]: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		const key = params.target === 'chatBackground' ? 'chatBackground' : 'background';
		let background = params[key] ?? params.background;

		await this.deleteBackground(c, key);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);

			const unsafe = /\.(html?|xhtml|svg|svgz|xml)$/i.test(file.name || '') || /^(text\/html|application\/xhtml\+xml|image\/svg\+xml)/i.test(file.type || '');
			const name = String(file.name || 'background').replace(/["\\\r\n]/g, '_');
			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: unsafe ? 'application/octet-stream' : file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `${unsafe ? 'attachment' : 'inline'}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`
			});

		}

		await orm(c).update(setting).set({ [key]: background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c, true);
		const token = await userContext.getToken(c);

		return {
			register: settingRow.register,
			title: settingRow.title,
			subtitle: settingRow.subtitle || '',
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			aiSummaryMode: settingRow.aiSummaryMode || 'manual',
			countRefreshMinutes: settingRow.countRefreshMinutes || 2,
			chatBackground: settingRow.chatBackground || '',
			chatOpacity: settingRow.chatOpacity,
			showAvatar: settingRow.showAvatar !== 0,
			loginOpacity: settingRow.loginOpacity,
			domainList: settingRow.loginDomain === 1 && !token ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoCallbackUrl: settingRow.linuxdoCallbackUrl,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			githubClientId: settingRow.githubClientId,
			githubCallbackUrl: settingRow.githubCallbackUrl,
			githubSwitch: settingRow.githubSwitch,
			googleClientId: settingRow.googleClientId,
			googleCallbackUrl: settingRow.googleCallbackUrl,
			googleSwitch: settingRow.googleSwitch,
			// 企业 SSO（OIDC）：只下发展示与授权所需的公开字段，client_secret 不出后端
			oidcName: settingRow.oidcName,
			oidcSwitch: settingRow.oidcSwitch === 1,
			oidcClientId: settingRow.oidcClientId,
			oidcCallbackUrl: settingRow.oidcCallbackUrl,
			oidcScope: settingRow.oidcScope,
			oidcProviders: this.enabledOidcProviders(settingRow).map(item => ({ id: item.id, name: item.name, icon: item.icon || '' })),
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink
		};
	},

};

export default settingService;
