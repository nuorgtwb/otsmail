import orm from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, notInArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive, text, searchType, startDate, endDate, mailbox, category, page } = params;

		size = Number(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);
		page = Number(page) || 0;
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		// 分类：unread 未读 / deleted 已删除 / spam 垃圾箱；缺省 inbox 即收件箱（排除垃圾与已删除）
		const mailboxCondition = category === 'spam' ? [eq(email.isDel, isDel.NORMAL), eq(email.spam, 1)] : mailbox === 'all' ? [eq(email.isDel, isDel.NORMAL)] : ({
			unread: [eq(email.isDel, isDel.NORMAL), eq(email.unread, emailConst.unread.UNREAD)],
			deleted: [eq(email.isDel, isDel.DELETE)],
			spam: [eq(email.isDel, isDel.NORMAL), eq(email.spam, 1)]
		}[mailbox] || [eq(email.isDel, isDel.NORMAL), eq(email.spam, 0)]);
		const categoryCondition = category && category !== 'spam' && category !== 'all' ? [eq(email.category, category)] : [];

		// 回收站同时展示收到的和发出的邮件；其它分类沿用页面传入的 type
		const typeCondition = (mailbox === 'deleted' || mailbox === 'all') ? sql`1 = 1` : eq(email.type, type);
		const pageCondition = page > 0 ? sql`1 = 1` : (timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));

		// 搜索：text 非空时按 searchType 匹配单个字段，startDate/endDate 限定时间范围
		const searchConditions = [];

		if (text && String(text).trim()) {
			const keyword = '%' + String(text).trim() + '%';
			const fieldMap = {
				subject: sql`${email.subject} COLLATE NOCASE LIKE ${keyword}`,
				content: sql`${email.text} COLLATE NOCASE LIKE ${keyword}`,
				sender: sql`${email.name} COLLATE NOCASE LIKE ${keyword}`,
				senderAddress: sql`${email.sendEmail} COLLATE NOCASE LIKE ${keyword}`,
				recipientAddress: sql`${email.recipient} COLLATE NOCASE LIKE ${keyword}`
			};
			const all = or(...Object.values(fieldMap));
			searchConditions.push(searchType === 'all' ? all : (fieldMap[searchType] || fieldMap.subject));
		}

		if (startDate) {
			searchConditions.push(gte(email.createTime, startDate));
		}

		if (endDate) {
			searchConditions.push(lte(email.createTime, endDate));
		}

		const query = orm(c)
			.select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				name: email.name,
				accountId: email.accountId,
				userId: email.userId,
				subject: email.subject,
				code: email.code,
				text: sql`substr(${email.text}, 1, 4000)`.as('text'),
				content: sql`substr(${email.content}, 1, 2000)`.as('content'),
				cc: email.cc,
				bcc: email.bcc,
				recipient: email.recipient,
				toEmail: email.toEmail,
				toName: email.toName,
				inReplyTo: email.inReplyTo,
				relation: email.relation,
				messageId: email.messageId,
				type: email.type,
				status: email.status,
				resendEmailId: email.resendEmailId,
				message: email.message,
				unread: email.unread,
				createTime: email.createTime,
				isDel: email.isDel,
				spam: email.spam,
				category: email.category,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			).leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					pageCondition,
					typeCondition,
					...mailboxCondition,
					...categoryCondition,
					eq(account.isDel, isDel.NORMAL),
					...searchConditions
				)
			);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = page > 0 ? query.limit(size).offset((page - 1) * size).all() : query.limit(size).all();

		// 列表每次刷新都会 COUNT 整个邮箱；同一筛选 60 秒内复用结果。
		const totalCacheKey = searchConditions.length === 0
			? `email:total:${userId}:${allReceive ? 1 : 0}:${accountId || 0}:${type ?? ''}:${mailbox || 'inbox'}:${category || 'all'}`
			: null;
		const cachedTotal = totalCacheKey ? await c.env.kv?.get(totalCacheKey) : null;
		const totalQuery = cachedTotal !== null && cachedTotal !== undefined
			? Promise.resolve({ total: Number(cachedTotal) })
			: orm(c).select({ total: count() }).from(email)
				.leftJoin(
					account,
					eq(account.accountId, email.accountId)
				)
				.where(
					and(
						allReceive ? eq(1,1) : eq(email.accountId, accountId),
						eq(email.userId, userId),
						typeCondition,
						...mailboxCondition,
						...categoryCondition,
						eq(account.isDel, isDel.NORMAL),
						...searchConditions
					)
				).get().then(async row => {
					if (totalCacheKey) await c.env.kv?.put(totalCacheKey, String(row.total), { expirationTtl: 60 });
					return row;
				});

		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId
		}).from(email).where(
			and(
				allReceive ? eq(1,1) : eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL),
				eq(email.spam, 0)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));


		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		const { syncDelete } = await settingService.query(c);

		if (syncDelete === settingConst.syncDelete.OPEN) {
			const owned = await orm(c).select({ emailId: email.emailId }).from(email)
				.where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList)))
				.all();
			const ownedIds = owned.map(row => row.emailId);
			if (ownedIds.length) {
				await this.physicsDelete(c, { emailIds: ownedIds.join(',') });
			}
			return;
		}

		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	async receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return await orm(c).insert(email).values({ ...params }).returning().get();
	},

	//邮件发送
	async send(c, params, userId) {

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments = [], //附件
			cc = [], //抄送
			bcc = [] //密送
		} = params;

		//抄送/密送去空、去重，且不与主收件人重复
		cc = [...new Set(cc.filter(Boolean))].filter(item => !receiveEmail.includes(item));
		bcc = [...new Set(bcc.filter(Boolean))].filter(item => !receiveEmail.includes(item) && !cc.includes(item));
		const recipients = [...receiveEmail, ...cc, ...bcc];

		const { resendTokens, r2Domain, send, domainList } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		//判断接收方是不是全部为站内邮箱
		const allInternal = recipients.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + recipients.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		let sendResult = {};

		//存在站外邮箱时，如果配置了 Cloudflare Email Service 就优先使用，否则使用 Resend
		const sendParams = {
			name,
			accountEmail: accountRow.email,
			receiveEmail,
			cc,
			bcc,
			subject,
			text,
			html,
			attachments: [...imageDataList, ...attachments],
			sendType,
			messageId: emailRow.messageId
		};

		if (!allInternal) {

			if (useCloudflareEmail) {
				try {
					sendResult = await this.sendByCloudflareEmail(c, sendParams);
					if (sendResult?.error) {
						throw new Error(sendResult.error.message || 'Cloudflare Email failed');
					}
				} catch (e) {
					// 站外邮件不能因为单一通道故障丢失，Cloudflare 失败时回退 Resend
					if (!resendToken) {
						throw e;
					}
					console.error('Cloudflare Email failed, falling back to Resend:', e);
					sendResult = await this.sendByResend(resendToken, sendParams);
				}
			} else {
				sendResult = await this.sendByResend(resendToken, sendParams);
			}

		}

		const { data, error } = sendResult;


		if (error) {
			throw new BizError(error.message);
		}

		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))

		//把图片标签cid标签切换会通用url
		html = this.imgReplace(html, imageDataList, r2Domain);

		//封装数据保存到数据库
		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		// shortcut: Cloudflare 只返回 queued 的 messageId，真实投递结果要靠事件订阅，先记 SENT
		emailData.status = emailConst.status.SENT;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.resendEmailId = data?.id;

		const recipient = [];

		receiveEmail.forEach(item => {
			recipient.push({ address: item, name: '' });
		});

		emailData.recipient = JSON.stringify(recipient);
		emailData.cc = JSON.stringify(cc.map(address => ({ address, name: emailUtils.getName(address) })));
		emailData.bcc = JSON.stringify(bcc.map(address => ({ address, name: emailUtils.getName(address) })));

		if (sendType === 'reply') {
			emailData.inReplyTo = emailRow.messageId;
			emailData.relation = emailRow.messageId;
		}

		//如果权限有发送次数增加用户发送次数
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, recipients.length, userId);
		}

		//保存到数据库并返回结果
		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		//保存内嵌附件
		if (imageDataList.length > 0) {
			if (imageDataList.length > 10) {
				throw new BizError(t('imageAttLimit'));
			}
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		//保存普通附件
		if (attachments?.length > 0) {
			if (attachments.length > 10) {
				throw new BizError(t('attLimit'));
			}
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		//如果全是站内接收方，直接写入数据库
		if (allInternal) {
			await this.HandleOnSiteEmail(c, recipients, emailResult, attList);
		}

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(recipients.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + recipients.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return [ emailResult ];
	},

	async sendByCloudflareEmail(c, params) {
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		if (params.cc?.length) {
			sendForm.cc = [...params.cc];
		}

		if (params.bcc?.length) {
			sendForm.bcc = [...params.bcc];
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		const result = await c.env.email.send(sendForm);

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken, params) {
		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.cc?.length) {
			sendForm.cc = [...params.cc];
		}

		if (params.bcc?.length) {
			sendForm.bcc = [...params.bcc];
		}

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm);
	},

	async toCloudflareAttachments(attachments) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(account.email, receiveEmail)).all();

		//查询所有收件人权限身份
		const userIds = accountList.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			//密送不随邮件下发，避免收件人看到彼此
			emailValues.bcc = '[]';
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			const accountRow = accountList.find(accountRow => accountRow.email === email);

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		allReceive = Number(allReceive);

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		let list = await orm(c).select({...email}).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(email.spam, 0),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		return list;
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	// 自动清理：删除早于 autoCleanDays 天的邮件，排除 autoCleanExclude 中的用户邮箱（移植自 cloud-mail v3.2.0）
	async autoClean(c) {
		const { autoCleanDays, autoCleanExclude } = await settingService.query(c);
		const days = Number(autoCleanDays);

		if (!days || days <= 0) {
			return;
		}

		const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss');
		const excludeEmails = String(autoCleanExclude || '')
			.split(/[,，]/)
			.map(item => item.trim())
			.filter(Boolean);

		let excludeUserIds = [];
		if (excludeEmails.length) {
			const rows = await orm(c)
				.select({ userId: user.userId })
				.from(user)
				.where(sql`lower(${user.email}) IN (${sql.join(excludeEmails.map(e => sql`${e.toLowerCase()}`), sql`, `)})`)
				.all();
			excludeUserIds = rows.map(row => row.userId);
		}

		const batchSize = 95;

		while (true) {
			const conditions = [lt(email.createTime, cutoff)];
			if (excludeUserIds.length) {
				conditions.push(notInArray(email.userId, excludeUserIds));
			}

			const rows = await orm(c)
				.select({ emailId: email.emailId })
				.from(email)
				.where(and(...conditions))
				.limit(batchSize)
				.all();

			if (!rows.length) {
				break;
			}

			const emailIds = rows.map(row => row.emailId);
			await this.physicsDelete(c, { emailIds: emailIds.join(',') });

			if (rows.length < batchSize) {
				break;
			}
		}
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort, keyword, page, category } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);
		page = Number(page) || 0;

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (category && category !== 'all') {
			conditions.push(eq(email.category, category));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
				)
			)
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${'%'+ name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${'%'+ subject + '%'}`);
		}

		if (keyword) {
			const like = '%' + keyword + '%';
			conditions.push(or(
				sql`${email.name} COLLATE NOCASE LIKE ${like}`,
				sql`${email.subject} COLLATE NOCASE LIKE ${like}`,
				sql`${email.sendEmail} COLLATE NOCASE LIKE ${like}`,
				sql`${email.toEmail} COLLATE NOCASE LIKE ${like}`,
				sql`${email.text} COLLATE NOCASE LIKE ${like}`,
			));
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		const countConditions = [...conditions];

		if (page <= 0) {
			if (timeSort) {
				conditions.unshift(gt(email.emailId, emailId));
			} else {
				conditions.unshift(lt(email.emailId, emailId));
			}
		}

		const query = orm(c).select({ ...email, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = page > 0 ? query.limit(size).offset((page - 1) * size).all() : query.limit(size).all();
		const totalQuery = queryCount.get();
		const latestEmailQuery = orm(c).select().from(email)
			.where(and(
				eq(email.type, emailConst.type.RECEIVE),
				ne(email.status, emailConst.status.SAVING)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({...email, userEmail: user.email}).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE),
					ne(email.status, emailConst.status.SAVING)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.RECEIVE} WHERE status = ${emailConst.status.SAVING} AND EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.NOONE} WHERE status = ${emailConst.status.SAVING} AND NOT EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
			const { emailIds } = params;
			// 入参不是数组时 inArray 会拿到 undefined，D1 直接 500；空列表本来也没什么可标的
			if (!Array.isArray(emailIds) || emailIds.length === 0) return;
			await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds))).run();
		},

	async unread(c, params, userId) {
			const { emailIds } = params;
			if (!Array.isArray(emailIds) || emailIds.length === 0) return;
			await orm(c).update(email).set({ unread: emailConst.unread.UNREAD }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds))).run();
		},

	async moveCategory(c, params, userId) {
			const { emailIds, category } = params;
			const allowed = ['primary', 'social', 'promotion', 'updates', 'ads', 'spam'];
			if (!allowed.includes(category)) throw new BizError('无效的邮件分类');
			if (!Array.isArray(emailIds) || emailIds.length === 0) return;
			const ids = emailIds.map(Number).filter(Number.isInteger);
			if (ids.length === 0) return;
			await orm(c).update(email).set({ category, spam: category === 'spam' ? 1 : 0 })
				.where(and(eq(email.userId, userId), inArray(email.emailId, ids))).run();
		},

	// 一次扫描同时算菜单/分类计数；原先 6 条 COUNT 各扫一遍用户全部邮件
	async counts(c, userId) {
		const row = await c.env.db.prepare(`
			SELECT
				COALESCE(SUM(CASE WHEN is_del = 0 AND type = 0 AND unread = 0 THEN 1 ELSE 0 END), 0) AS inbox,
				COALESCE(SUM(CASE WHEN is_del = 0 AND spam = 0 AND type = 1 THEN 1 ELSE 0 END), 0) AS sent,
				COALESCE(SUM(CASE WHEN is_del = 1 THEN 1 ELSE 0 END), 0) AS deleted,
				COALESCE(SUM(CASE WHEN is_del = 0 AND type = 0 AND spam = 1 AND unread = 0 THEN 1 ELSE 0 END), 0) AS spam,
				COALESCE(SUM(CASE WHEN is_del = 0 AND type = 0 AND spam = 0 AND unread = 0 AND category = 'primary' THEN 1 ELSE 0 END), 0) AS primary_c,
				COALESCE(SUM(CASE WHEN is_del = 0 AND type = 0 AND spam = 0 AND unread = 0 AND category = 'social' THEN 1 ELSE 0 END), 0) AS social,
				COALESCE(SUM(CASE WHEN is_del = 0 AND type = 0 AND spam = 0 AND unread = 0 AND category = 'promotion' THEN 1 ELSE 0 END), 0) AS promotion,
				COALESCE(SUM(CASE WHEN is_del = 0 AND type = 0 AND spam = 0 AND unread = 0 AND category = 'updates' THEN 1 ELSE 0 END), 0) AS updates,
				COALESCE(SUM(CASE WHEN is_del = 0 AND type = 0 AND spam = 0 AND unread = 0 AND category = 'ads' THEN 1 ELSE 0 END), 0) AS ads
			FROM email WHERE user_id = ?
		`).bind(userId).first();
		const n = key => Number(row?.[key]) || 0;
		return {
			menu: { inbox: n('inbox'), sent: n('sent'), deleted: n('deleted'), spam: n('spam') },
			category: { primary: n('primary_c'), social: n('social'), promotion: n('promotion'), updates: n('updates'), ads: n('ads'), spam: n('spam') }
		};
	},

	async categoryCounts(c, userId) {
		return (await this.counts(c, userId)).category;
	},

	async menuCounts(c, userId) {
		return (await this.counts(c, userId)).menu;
	},

		async spam(c, params, userId) {
			await this.updateOwn(c, params.emailId, userId, { spam: 1 });
		},

		async spamCancel(c, params, userId) {
			await this.updateOwn(c, params.emailId, userId, { spam: 0 });
		},

		async restore(c, params, userId) {
			await this.updateOwn(c, params.emailId, userId, { isDel: isDel.NORMAL });
		},

		// 回收站里彻底删除：只删自己的邮件（/email/delete 在 syncDelete 关闭时只是重复打删除标记）
		async physicsDeleteOwn(c, params, userId) {
			const row = await orm(c).select({ emailId: email.emailId }).from(email)
				.where(and(eq(email.userId, userId), eq(email.emailId, Number(params.emailId)))).get();
			if (row) {
				await this.physicsDelete(c, { emailIds: String(row.emailId) });
			}
		},

		// 只改当前用户自己的邮件，避免越权改他人分类
		async updateOwn(c, emailId, userId, values) {
			await orm(c).update(email).set(values).where(and(eq(email.userId, userId), eq(email.emailId, Number(emailId)))).run();
		},

		// v1.0: GET /email/detail?emailId= —— 单封详情，复用 emailAddAtt 组装 attList（T-02 根治）
		async detail(c, params, userId) {
			const emailId = Number(params.emailId);
			const row = await orm(c).select({
				...email,
				starId: star.starId
			})
				.from(email)
				.leftJoin(star, and(eq(star.emailId, email.emailId), eq(star.userId, userId)))
				.where(and(
					eq(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL)
				))
				.get();

			if (!row) {
				// 记录不存在或非当前用户 → 不可读
				throw new BizError(t('authExpired'));
			}

			const detail = { ...row, isStar: row.starId != null ? 1 : 0 };
			await this.emailAddAtt(c, [detail]);
			return detail;
		}
	};

export default emailService;
