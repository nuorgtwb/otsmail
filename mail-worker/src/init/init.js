import settingService from '../service/setting-service';
import emailUtils from '../utils/email-utils';
import {emailConst} from "../const/entity-const";

const dbInit = {
	async init(c) {

		const secret = c.req.header('x-init-secret') || '';

		// 初始化接口只允许用独立 init_secret 触发一次，绝不能复用 JWT 密钥
		if (!c.env.init_secret || secret !== c.env.init_secret) {
			return new Response('Not Found', { status: 404 });
		}

		if (await c.env.kv.get('init_done') === '1') {
			return new Response('Not Found', { status: 404 });
		}

		await this.intDB(c);
		await this.v1_1DB(c);
		await this.v1_2DB(c);
		await this.v1_3DB(c);
		await this.v1_3_1DB(c);
		await this.v1_4DB(c);
		await this.v1_5DB(c);
		await this.v1_6DB(c);
		await this.v1_7DB(c);
		await this.v2DB(c);
		await this.v2_3DB(c);
		await this.v2_4DB(c);
		await this.v2_5DB(c);
		await this.v2_6DB(c);
		await this.v2_7DB(c);
		await this.v2_8DB(c);
		await this.v2_9DB(c);
		await this.v3_0DB(c);
		await this.v3_1DB(c);
		await this.otsmail_1DB(c);
		await this.otsmail_2DB(c);
		await this.otsmail_3DB(c);
		await this.otsmail_4DB(c);
		await this.otsmail_5DB(c);
		await this.otsmail_6DB(c);
		await this.otsmail_12DB(c);
		await this.otsmail_7DB(c);
		await this.otsmail_10DB(c);
		await this.otsmail_11DB(c);
		await this.otsmail_aiDB(c);
		await this.otsmail_13DB(c);
		await this.otsmail_14DB(c);
		await this.otsmail_15DB(c);
		await this.otsmail_16DB(c);
		await this.otsmail_17DB(c);
		await this.otsmail_18DB(c);
		await this.otsmail_19DB(c);
		await this.otsmail_20DB(c);
		await this.otsmail_21DB(c);
		await this.otsmail_22DB(c);
		await this.otsmail_9DB(c);
		await settingService.refresh(c);
		await c.env.kv.put('init_done', '1');
		return c.text('success');
	},

	// otsmail 迁移：企业 SSO（OIDC）字段，后台界面可配
	async otsmail_6DB(c) {
		const columns = [
			`oidc_switch INTEGER NOT NULL DEFAULT 0`,
			`oidc_name TEXT NOT NULL DEFAULT 'SSO'`,
			`oidc_issuer TEXT NOT NULL DEFAULT ''`,
			`oidc_client_id TEXT NOT NULL DEFAULT ''`,
			`oidc_client_secret TEXT NOT NULL DEFAULT ''`,
			`oidc_scope TEXT NOT NULL DEFAULT 'openid profile email'`,
			`oidc_callback_url TEXT NOT NULL DEFAULT ''`
		];
		// 逐列执行：已存在的列跳过，不能让一条失败拖掉其余列
		for (const column of columns) {
			try {
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ${column};`).run();
			} catch (e) {
				console.warn(`跳过字段：${e.message}`);
			}
		}
	},

	// otsmail 迁移：多 OIDC 服务商列表（JSON 数组，单条 oidc_* 字段保留兼容）
	async otsmail_12DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN oidc_providers TEXT NOT NULL DEFAULT '[]';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	// otsmail 迁移：AI 助手改用 OpenAI 兼容接口（后台可配地址/Key/模型）
	async otsmail_13DB(c) {
		const columns = [
			`ai_base_url TEXT NOT NULL DEFAULT ''`,
			`ai_api_key TEXT NOT NULL DEFAULT ''`,
			`ai_model TEXT NOT NULL DEFAULT ''`
		];
		for (const column of columns) {
			try {
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ${column};`).run();
			} catch (e) {
				console.warn(`跳过字段：${e.message}`);
			}
		}
	},

	// otsmail 迁移：邮件垃圾标记（未读 / 已删除 / 垃圾箱三个列表要用）
	// otsmail 迁移：Gmail 式收件分类（primary/social/promotion/updates/ads/spam）
	async otsmail_14DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE email ADD COLUMN category TEXT NOT NULL DEFAULT 'primary';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		// 给升级前已有的邮件补一版粗分类，之后新邮件由 AI + 规则分类
		// SQL 是固定常量，分类值走 bind；不要再把变量拼进 SQL
		const rules = [
			['spam', `UPDATE email SET category = ? WHERE category = 'primary' AND spam = 1`],
			['social', `UPDATE email SET category = ? WHERE category = 'primary' AND (send_email LIKE '%facebook.%' OR send_email LIKE '%twitter.%' OR send_email LIKE '%linkedin.%' OR send_email LIKE '%instagram.%' OR send_email LIKE '%pinterest.%' OR send_email LIKE '%reddit.%' OR send_email LIKE '%slack.%')`],
			['promotion', `UPDATE email SET category = ? WHERE category = 'primary' AND (subject LIKE '%sale%' OR subject LIKE '%discount%' OR subject LIKE '%优惠%' OR subject LIKE '%促销%' OR subject LIKE '%折扣%' OR subject LIKE '%限时%')`],
			['updates', `UPDATE email SET category = ? WHERE category = 'primary' AND (subject LIKE '%verify%' OR subject LIKE '%security%' OR subject LIKE '%receipt%' OR subject LIKE '%invoice%' OR subject LIKE '%order%' OR subject LIKE '%验证码%' OR subject LIKE '%账单%' OR subject LIKE '%订单%')`],
			['ads', `UPDATE email SET category = ? WHERE category = 'primary' AND (subject LIKE '%广告%' OR subject LIKE '%推广%' OR subject LIKE '%sponsor%')`]
		];
		for (const [category, sql] of rules) {
			try {
				await c.env.db.prepare(sql).bind(category).run();
			} catch (e) {
				console.warn(`跳过分类回填：${e.message}`);
			}
		}
	},

	// otsmail 迁移：分类方式 off=本地规则 / auto=收信时 AI / manual=手动按钮触发 AI
	async otsmail_15DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ai_classify_mode TEXT NOT NULL DEFAULT 'off';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	// otsmail 迁移：站点副标题、聊天背景、密码登录强制两步验证
	async otsmail_16DB(c) {
		const columns = [
			`subtitle TEXT NOT NULL DEFAULT ''`,
			`chat_background TEXT`,
			`chat_opacity INTEGER NOT NULL DEFAULT 0.88`
		];
		for (const column of columns) {
			try {
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ${column};`).run();
			} catch (e) {
				console.warn(`跳过字段：${e.message}`);
			}
		}
		try {
			await c.env.db.prepare(`ALTER TABLE user ADD COLUMN two_factor_required INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	// otsmail 迁移：邮件过滤规则（发件人/主题/收件人 → 分类）
	async otsmail_17DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN email_filters TEXT NOT NULL DEFAULT '[]';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
		try {
			// 计数一次扫描该索引；否则每次 COUNT 都扫用户全部邮件
			await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_counts ON email(user_id, is_del, type, spam, unread, category);`).run();
		} catch (e) {
			console.warn(`跳过索引：${e.message}`);
		}
	},

	// otsmail 迁移：写信/地址簿头像总开关（0 关闭，1 显示）
	async otsmail_18DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN show_avatar INTEGER NOT NULL DEFAULT 1;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async otsmail_11DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE email ADD COLUMN spam INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},


	// otsmail 迁移：AI 助手权限点（默认身份全部授予，升级后老用户不会被 403 挡住）
	async otsmail_aiDB(c) {
		try {
			await c.env.db.prepare(`
        INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
        (61,'AI 助手', NULL, 0, 1, 5.2),
        (62,'AI 使用', 'ai:use', 61, 2, 0)`).run();
		} catch (e) {
			console.warn(`跳过数据：${e.message}`);
		}

		try {
			await c.env.db.prepare(`
        INSERT INTO role_perm (role_id, perm_id)
        SELECT role_id, 62 FROM role
        WHERE role_id NOT IN (SELECT role_id FROM role_perm WHERE perm_id = 62)`).run();
		} catch (e) {
			console.warn(`跳过数据：${e.message}`);
		}
	},

	// otsmail 迁移：个人设置（头像 + 两步验证）字段
	async otsmail_9DB(c) {
		const columns = [
			`avatar TEXT NOT NULL DEFAULT ''`,
			`two_factor_switch INTEGER NOT NULL DEFAULT 0`,
			`two_factor_secret TEXT NOT NULL DEFAULT ''`
		];
		for (const column of columns) {
			try {
				await c.env.db.prepare(`ALTER TABLE user ADD COLUMN ${column};`).run();
			} catch (e) {
				console.warn(`跳过字段：${e.message}`);
			}
		}
	},

	// otsmail 迁移：联系人（分组 + 备注），同一用户下 email 唯一
	async otsmail_7DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`CREATE TABLE IF NOT EXISTS contact (
					contact_id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL,
					name TEXT NOT NULL DEFAULT '',
					email TEXT NOT NULL,
					group_name TEXT NOT NULL DEFAULT '默认',
					remark TEXT NOT NULL DEFAULT '',
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					is_del INTEGER NOT NULL DEFAULT 0
				)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_user_email ON contact(user_id, email)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_contact_user_group ON contact(user_id, group_name, is_del)`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	// otsmail 迁移：MCP 授权——访问令牌表 + OAuth 客户端表
	async otsmail_10DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`CREATE TABLE IF NOT EXISTS mcp_token (
					token_id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL,
					name TEXT NOT NULL DEFAULT '',
					token_prefix TEXT NOT NULL DEFAULT '',
					token_hash TEXT NOT NULL,
					client_id TEXT NOT NULL DEFAULT '',
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					last_used_at DATETIME,
					revoked INTEGER NOT NULL DEFAULT 0
				)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_token_hash ON mcp_token(token_hash)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mcp_token_user ON mcp_token(user_id)`),
				c.env.db.prepare(`CREATE TABLE IF NOT EXISTS mcp_client (
					client_id TEXT PRIMARY KEY,
					client_secret_hash TEXT NOT NULL,
					name TEXT NOT NULL DEFAULT '',
					user_id INTEGER NOT NULL DEFAULT 0,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					revoked INTEGER NOT NULL DEFAULT 0
				)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mcp_client_user ON mcp_client(user_id)`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	// otsmail 迁移：管理员可配的 DeepL API key（存 setting，前端设置页可填）
	async otsmail_2DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN deepl_key TEXT NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	// otsmail 迁移：Webhook + 自动清理 字段 + 性能索引（移植自 maillab/cloud-mail v3.2.0）
	async otsmail_3DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_url TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_status INTEGER NOT NULL DEFAULT 1;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_retry INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_secret TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN auto_clean_days INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN auto_clean_exclude TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_create_time ON email(create_time)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_attachments_email_type ON attachments(email_id, type)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_role_perm_role ON role_perm(role_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth(user_id)`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	// otsmail 迁移：T-04 列表性能复合索引（对齐上游 a8c9ae3，mail list/latest 查询路径）
async otsmail_4DB(c) {
	try {
		await c.env.db.batch([
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_list_user ON email(user_id, type, is_del, email_id)`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_list_account ON email(user_id, account_id, type, is_del, email_id)`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_star_user_email ON star(user_id, email_id)`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_name_nocase ON email(name COLLATE NOCASE)`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_subject_nocase ON email(subject COLLATE NOCASE)`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_to_email_nocase ON email(to_email COLLATE NOCASE)`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_send_email_nocase ON email(send_email COLLATE NOCASE)`)
		]);
	} catch (e) {
		console.warn(`跳过字段：${e.message}`);
	}
},

// otsmail 迁移：oauth 表新增 provider 列（v1.4，区分 github/google/linuxdo 防跨平台撞号）
async otsmail_5DB(c) {
	try {
		await c.env.db.batch([
			c.env.db.prepare(`ALTER TABLE oauth ADD COLUMN provider text`),
			c.env.db.prepare(`UPDATE oauth SET provider = 'linuxdo' WHERE provider IS NULL`),
			c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_provider_user ON oauth(provider, oauth_user_id)`)
		]);
	} catch (e) {
		console.warn(`跳过字段：${e.message}`);
	}
},

// otsmail 迁移：邮件翻译缓存表
	async otsmail_1DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`CREATE TABLE IF NOT EXISTS email_translation (
					email_id INTEGER NOT NULL,
					target_lang TEXT NOT NULL,
					user_id INTEGER NOT NULL,
					translated_subject TEXT NOT NULL,
					translated_content TEXT NOT NULL,
					source_lang TEXT,
					model TEXT NOT NULL,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
					PRIMARY KEY (email_id, target_lang)
				)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_translation_user ON email_translation (user_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_translation_email ON email_translation (email_id)`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_1DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN sync_delete INTEGER NOT NULL DEFAULT 1;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_0DB(c) {
		try {
			await c.env.db.batch([
				await c.env.db.prepare(`ALTER TABLE email ADD COLUMN code TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ai_code INTEGER NOT NULL DEFAULT 1;`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ai_code_filter TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_subject TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_content TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_from TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

	},

	async v2_9DB(c) {
		try {
			await c.env.db.prepare(`UPDATE setting SET auto_refresh = 5 WHERE auto_refresh = 1;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_8DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE account ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_7DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting RENAME COLUMN auto_refresh_time TO auto_refresh;`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_6DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE account ADD COLUMN all_receive INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_5DB(c) {

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN email_prefix_filter text NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE email ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`UPDATE email SET unread = 1;`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

	},

	async v2_4DB(c) {
		try {
			await c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS oauth (
					oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,
					oauth_user_id TEXT,
					username TEXT,
					name TEXT,
					avatar TEXT,
					active INTEGER,
					trust_level INTEGER,
					silenced INTEGER,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					platform INTEGER NOT NULL DEFAULT 0,
					user_id INTEGER NOT NULL DEFAULT 0
				)
			`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN min_email_prefix INTEGER NOT NULL DEFAULT 1;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

	},

	async v2_3DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN force_path_style	INTEGER NOT NULL DEFAULT 1;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN custom_domain TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_to TEXT NOT NULL DEFAULT 'show';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_from TEXT NOT NULL DEFAULT 'only-name';`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_text TEXT NOT NULL DEFAULT 'show';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

	},

	async v2DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN bucket TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN region TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN endpoint TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN s3_access_key TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN s3_secret_key TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`DELETE FROM perm WHERE perm_key = 'setting:clean'`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v1_7DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN login_domain INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v1_6DB(c) {

		const noticeContent = '本项目仅供学习交流，禁止用于违法业务\n' +
			'<br>\n' +
			'请遵守当地法规，作者不承担任何法律责任'

		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE setting ADD COLUMN reg_verify_count INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN add_verify_count INTEGER NOT NULL DEFAULT 1;`,
			`CREATE TABLE IF NOT EXISTS verify_record (
				vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
				ip TEXT NOT NULL DEFAULT '',
				count INTEGER NOT NULL DEFAULT 1,
				type INTEGER NOT NULL DEFAULT 0,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
			`ALTER TABLE setting ADD COLUMN notice_title TEXT NOT NULL DEFAULT 'Cloud Mail';`,
			`ALTER TABLE setting ADD COLUMN notice_content TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN notice_type TEXT NOT NULL DEFAULT 'none';`,
			`ALTER TABLE setting ADD COLUMN notice_duration INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN notice_offset INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN notice_position TEXT NOT NULL DEFAULT 'top-right';`,
			`ALTER TABLE setting ADD COLUMN notice_width INTEGER NOT NULL DEFAULT 340;`,
			`ALTER TABLE setting ADD COLUMN notice INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN no_recipient INTEGER NOT NULL DEFAULT 1;`,
			`UPDATE role SET avail_domain = '' WHERE role.avail_domain LIKE '@%';`,
			`CREATE INDEX IF NOT EXISTS idx_email_user_id_account_id ON email(user_id, account_id);`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`跳过字段：${e.message}`);
			}
		});

		await Promise.all(promises);
		await c.env.db.prepare(`UPDATE setting SET notice_content = ? WHERE notice_content = '';`).bind(noticeContent).run();
		try {
			await c.env.db.batch([
				c.env.db.prepare(`DROP INDEX IF EXISTS idx_account_email`),
				c.env.db.prepare(`DROP INDEX IF EXISTS idx_user_email`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_nocase ON account (email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_nocase ON user (email COLLATE NOCASE)`)
			]);
		} catch (e) {
			console.warn(e.message)
		}

	},

	async v1_5DB(c) {
		await c.env.db.prepare(`UPDATE perm SET perm_key = 'all-email:query' WHERE perm_key = 'sys-email:query'`).run();
		await c.env.db.prepare(`UPDATE perm SET perm_key = 'all-email:delete' WHERE perm_key = 'sys-email:delete'`).run();
		try {
			await c.env.db.prepare(`ALTER TABLE role ADD COLUMN avail_domain TEXT NOT NULL DEFAULT ''`).run();
		} catch (e) {
			console.warn(`跳过字段添加：${e.message}`);
		}
	},

	async v1_4DB(c) {
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS reg_key (
				rege_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
				code TEXT NOT NULL COLLATE NOCASE DEFAULT '',
				count INTEGER NOT NULL DEFAULT 0,
				role_id INTEGER NOT NULL DEFAULT 0,
				user_id INTEGER NOT NULL DEFAULT 0,
				expire_time DATETIME,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

		// 添加不区分大小写的唯一索引
		try {
			await c.env.db.prepare(`
				CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_code ON reg_key(code COLLATE NOCASE)
			`).run();
		} catch (e) {
			console.warn(`跳过创建索引：${e.message}`);
		}


		try {
			await c.env.db.prepare(`
        INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
        (33,'注册密钥', NULL, 0, 1, 5.1),
        (34,'密钥查看', 'reg-key:query', 33, 2, 0),
        (35,'密钥添加', 'reg-key:add', 33, 2, 1),
        (36,'密钥删除', 'reg-key:delete', 33, 2, 2)`).run();
		} catch (e) {
			console.warn(`跳过数据：${e.message}`);
		}

		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE setting ADD COLUMN reg_key INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE role ADD COLUMN ban_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE role ADD COLUMN ban_email_type INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE user ADD COLUMN reg_key_id INTEGER NOT NULL DEFAULT 0;`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`跳过字段添加：${e.message}`);
			}
		});

		await Promise.all(promises);

	},

	async v1_3_1DB(c) {
		await c.env.db.prepare(`UPDATE email SET name = SUBSTR(send_email, 1, INSTR(send_email, '@') - 1) WHERE (name IS NULL OR name = '') AND type = ${emailConst.type.RECEIVE}`).run();
	},

	async v1_3DB(c) {

		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE setting ADD COLUMN tg_bot_token TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN tg_chat_id TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN tg_bot_status INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN forward_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN forward_status INTEGER TIME NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN rule_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN rule_type INTEGER NOT NULL DEFAULT 0;`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`跳过字段添加：${e.message}`);
			}
		});

		await Promise.all(promises);

		const nameColumn = await c.env.db.prepare(`SELECT * FROM pragma_table_info('email') WHERE name = 'to_email' limit 1`).first();

		if (nameColumn) {
			return
		}

		const queryList = []

		queryList.push(c.env.db.prepare(`ALTER TABLE email ADD COLUMN to_email TEXT NOT NULL DEFAULT ''`));
		queryList.push(c.env.db.prepare(`ALTER TABLE email ADD COLUMN to_name TEXT NOT NULL DEFAULT ''`));
		queryList.push(c.env.db.prepare(`UPDATE email SET to_email = json_extract(recipient, '$[0].address'), to_name = json_extract(recipient, '$[0].name')`));

		await c.env.db.batch(queryList);

	},

	async v1_2DB(c){

		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE email ADD COLUMN recipient TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN cc TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN bcc TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN message_id TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE email ADD COLUMN in_reply_to TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE email ADD COLUMN relation TEXT NOT NULL DEFAULT '';`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`跳过字段添加：${e.message}`);
			}
		});

		await Promise.all(promises);

		await this.receiveEmailToRecipient(c);
		await this.initAccountName(c);

		try {
			await c.env.db.prepare(`
        INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
        (31,'分析页', NULL, 0, 1, 2.1),
        (32,'数据查看', 'analysis:query', 31, 2, 1)`).run();
		} catch (e) {
			console.warn(`跳过数据：${e.message}`);
		}

	},

	async v1_1DB(c) {
		// 添加字段
		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE email ADD COLUMN type INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE email ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE email ADD COLUMN resend_email_id TEXT;`,
			`ALTER TABLE email ADD COLUMN message TEXT;`,

			`ALTER TABLE setting ADD COLUMN resend_tokens TEXT NOT NULL DEFAULT '{}';`,
			`ALTER TABLE setting ADD COLUMN send INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN r2_domain TEXT;`,
			`ALTER TABLE setting ADD COLUMN site_key TEXT;`,
			`ALTER TABLE setting ADD COLUMN secret_key TEXT;`,
			`ALTER TABLE setting ADD COLUMN background TEXT;`,
			`ALTER TABLE setting ADD COLUMN login_opacity INTEGER NOT NULL DEFAULT 0.90;`,

			`ALTER TABLE user ADD COLUMN create_ip TEXT;`,
			`ALTER TABLE user ADD COLUMN active_ip TEXT;`,
			`ALTER TABLE user ADD COLUMN os TEXT;`,
			`ALTER TABLE user ADD COLUMN browser TEXT;`,
			`ALTER TABLE user ADD COLUMN device TEXT;`,
			`ALTER TABLE user ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE user ADD COLUMN send_count INTEGER NOT NULL DEFAULT 0;`,

			`ALTER TABLE attachments ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE attachments ADD COLUMN type INTEGER NOT NULL DEFAULT 0;`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`跳过字段添加：${e.message}`);
			}
		});

		await Promise.all(promises);

		// 创建 perm 表并初始化
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS perm (
        perm_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        perm_key TEXT,
        pid INTEGER NOT NULL DEFAULT 0,
        type INTEGER NOT NULL DEFAULT 2,
        sort INTEGER
      )
    `).run();

		const {permTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm`).first();

		if (permTotal === 0) {
			await c.env.db.prepare(`
        INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
        (1, '邮件', NULL, 0, 0, 0),
        (2, '邮件删除', 'email:delete', 1, 2, 1),
        (3, '邮件发送', 'email:send', 1, 2, 0),
        (4, '个人设置', '', 0, 1, 2),
        (5, '用户注销', 'my:delete', 4, 2, 0),
        (6, '用户信息', NULL, 0, 1, 3),
        (7, '用户查看', 'user:query', 6, 2, 0),
        (8, '密码修改', 'user:set-pwd', 6, 2, 2),
        (9, '状态修改', 'user:set-status', 6, 2, 3),
        (10, '权限修改', 'user:set-type', 6, 2, 4),
        (11, '用户删除', 'user:delete', 6, 2, 7),
        (12, '用户收藏', 'user:star', 6, 2, 5),
        (13, '权限控制', '', 0, 1, 5),
        (14, '身份查看', 'role:query', 13, 2, 0),
        (15, '身份修改', 'role:set', 13, 2, 1),
        (16, '身份删除', 'role:delete', 13, 2, 2),
        (17, '系统设置', '', 0, 1, 6),
        (18, '设置查看', 'setting:query', 17, 2, 0),
        (19, '设置修改', 'setting:set', 17, 2, 1),
        (21, '邮箱侧栏', '', 0, 0, 1),
        (22, '邮箱查看', 'account:query', 21, 2, 0),
        (23, '邮箱添加', 'account:add', 21, 2, 1),
        (24, '邮箱删除', 'account:delete', 21, 2, 2),
        (25, '用户添加', 'user:add', 6, 2, 1),
        (26, '发件重置', 'user:reset-send', 6, 2, 6),
        (27, '邮件列表', '', 0, 1, 4),
        (28, '邮件查看', 'all-email:query', 27, 2, 0),
        (29, '邮件删除', 'all-email:delete', 27, 2, 0),
				(30, '身份添加', 'role:add', 13, 2, -1)
      `).run();
		}

		await c.env.db.prepare(`UPDATE perm SET perm_key = 'setting:clean' WHERE perm_key = 'seting:clear'`).run();
		await c.env.db.prepare(`DELETE FROM perm WHERE perm_key = 'user:star'`).run();
		// 创建 role 表并插入默认身份
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS role (
        role_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        key TEXT,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        sort INTEGER DEFAULT 0,
        description TEXT,
        user_id INTEGER,
        is_default INTEGER DEFAULT 0,
        send_count INTEGER,
        send_type TEXT NOT NULL DEFAULT 'count',
        account_count INTEGER
      )
    `).run();

		const { roleCount } = await c.env.db.prepare(`SELECT COUNT(*) as roleCount FROM role`).first();
		if (roleCount === 0) {
			await c.env.db.prepare(`
        INSERT INTO role (
          role_id, name, key, create_time, sort, description, user_id, is_default, send_count, send_type, account_count
        ) VALUES (
          1, '普通用户', NULL, '0000-00-00 00:00:00', 0, '只有普通使用权限', 0, 1, NULL, 'ban', 10
        )
      `).run();
		}

		// 创建 role_perm 表并初始化数据
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS role_perm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER,
        perm_id INTEGER
      )
    `).run();

		const {rolePermCount} = await c.env.db.prepare(`SELECT COUNT(*) as rolePermCount FROM role_perm`).first();
		if (rolePermCount === 0) {
			await c.env.db.prepare(`
        INSERT INTO role_perm (id, role_id, perm_id) VALUES
          (100, 1, 2),
          (101, 1, 21),
          (102, 1, 22),
          (103, 1, 23),
          (104, 1, 24),
          (105, 1, 4),
          (106, 1, 5),
          (107, 1, 1),
          (108, 1, 3)
      `).run();
		}
	},

	async intDB(c) {
		// 初始化数据库表结构
		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS email (
			email_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
			send_email TEXT,
			name TEXT,
			account_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			subject TEXT,
			content TEXT,
			text TEXT,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS star (
			star_id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			email_id INTEGER NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS attachments (
			att_id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			email_id INTEGER NOT NULL,
			account_id INTEGER NOT NULL,
			key TEXT NOT NULL,
			filename TEXT,
			mime_type TEXT,
			size INTEGER,
			disposition TEXT,
			related TEXT,
			content_id TEXT,
			encoding TEXT,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS user (
			user_id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			type INTEGER DEFAULT 1 NOT NULL,
			password TEXT NOT NULL,
			salt TEXT NOT NULL,
			status INTEGER DEFAULT 0 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
			active_time DATETIME,
			is_del INTEGER DEFAULT 0 NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS account (
			account_id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			status INTEGER DEFAULT 0 NOT NULL,
			latest_email_time DATETIME,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
			user_id INTEGER NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS setting (
			register INTEGER NOT NULL,
			receive INTEGER NOT NULL,
			add_email INTEGER NOT NULL,
			many_email INTEGER NOT NULL,
			title TEXT NOT NULL,
			auto_refresh INTEGER NOT NULL,
			register_verify INTEGER NOT NULL,
			add_email_verify INTEGER NOT NULL
		  )
		`).run();

		try {
			await c.env.db.prepare(`
			  INSERT INTO setting (
				register, receive, add_email, many_email, title, auto_refresh, register_verify, add_email_verify
			  )
			  SELECT 0, 0, 0, 0, 'Cloud Mail', 0, 1, 1
			  WHERE NOT EXISTS (SELECT 1 FROM setting)
			`).run();
		} catch (e) {
			console.warn(e)
		}

	},

	async receiveEmailToRecipient(c) {

		const receiveEmailColumn = await c.env.db.prepare(`SELECT * FROM pragma_table_info('email') WHERE name = 'receive_email' limit 1`).first();

		if (!receiveEmailColumn) {
			return
		}

		const queryList = []
		const {results} = await c.env.db.prepare('SELECT receive_email,email_id FROM email').all();
		results.forEach(emailRow => {
			const recipient = {}
			recipient.address = emailRow.receive_email
			recipient.name = ''
			const recipientStr = JSON.stringify([recipient]);
			const sql = c.env.db.prepare('UPDATE email SET recipient = ? WHERE email_id = ?').bind(recipientStr,emailRow.email_id);
			queryList.push(sql)
		})

		queryList.push(c.env.db.prepare("ALTER TABLE email DROP COLUMN receive_email"));

		await c.env.db.batch(queryList);
	},


	async initAccountName(c) {

		const nameColumn = await c.env.db.prepare(`SELECT * FROM pragma_table_info('account') WHERE name = 'name' limit 1`).first();

		if (nameColumn) {
			return
		}

		const queryList = []

		queryList.push(c.env.db.prepare(`ALTER TABLE account ADD COLUMN name TEXT NOT NULL DEFAULT ''`));

		const {results} = await c.env.db.prepare(`SELECT account_id, email FROM account`).all();

		results.forEach(accountRow => {
			const name = emailUtils.getName(accountRow.email);
			const sql = c.env.db.prepare('UPDATE account SET name = ? WHERE account_id = ?').bind(name,accountRow.account_id);
			queryList.push(sql)
		})

		await c.env.db.batch(queryList);
		},
	// otsmail 19: AI 摘要方式（manual / auto）
	async otsmail_19DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ai_summary_mode TEXT NOT NULL DEFAULT 'manual';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async otsmail_21DB(c) {
		try {
			await Promise.all([
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_dedupe ON email(message_id, to_email, type, status)`).run(),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_counts ON email(user_id, is_del, type, spam, unread, category)`).run(),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_box_page ON email(user_id, is_del, type, spam, category, email_id)`).run(),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_account_page ON email(user_id, account_id, is_del, type, spam, category, email_id)`).run()
			]);
		} catch (e) {
			console.warn(`index: ${e.message}`);
		}
	},

	async otsmail_22DB(c) {
		try {
			await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS user_perm (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				perm_id INTEGER NOT NULL,
				allow INTEGER NOT NULL DEFAULT 1
			);`).run();
			await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_perm ON user_perm(user_id, perm_id);`).run();
		} catch (e) {
			console.warn(`user_perm: ${e.message}`);
		}
	},

	async otsmail_20DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN count_refresh_minutes INTEGER NOT NULL DEFAULT 2;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

};
export { dbInit };
