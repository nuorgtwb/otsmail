# otsmail

<p align="center">
  <img src="doc/demo/logo.png" width="72" alt="otsmail" />
</p>

<p align="center">
  基于 Cloudflare Workers 的自建邮箱系统：Cloudflare Email Routing 收信，Resend / Cloudflare Email Service 发信，D1 + KV + R2 存储。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
  <img src="https://img.shields.io/badge/platform-Cloudflare%20Workers-orange" alt="platform" />
  <img src="https://img.shields.io/badge/frontend-Vue%203-42b883" alt="Vue" />
</p>

> Fork 自 [maillab/cloud-mail](https://github.com/maillab/cloud-mail)，保留 MIT 协议与 Cloudflare 原生架构，并在此基础上做了安全加固与功能扩展。

## 功能

| 功能 | 说明 |
|---|---|
| 多邮箱账户 | 同一账号下管理多个邮箱，支持域名、名称、默认发件账号和“所有账户邮件” |
| 邮件列表 | Gmail 风格三栏布局、分类标签、未读计数、分页、搜索高亮、右键多选和批量操作 |
| 阅读器 | 发件人折叠/展开、回复/回复全部/转发、附件、HTML 邮件安全渲染、深色模式 |
| AI 助手 | OpenAI 兼容接口，可配置 Base URL / API Key / 模型；支持摘要、翻译、润色、写信和邮件问答 |
| 自动分类 | 本地规则优先，可切换自动 AI 分类或手动分类；分类可在列表/详情/右键菜单移动 |
| Telegram | 同一个 Bot 接收未读、搜索、已读/未读、删除、归档等指令，也支持自然语言 AI 操作 |
| MCP | 内置 MCP Server，支持 Bearer Token、查询参数 Token 和 OAuth `client_credentials` |
| 安全 | 登录限速、异常告警、2FA、OIDC、PKCE、DOMPurify、参数化 SQL、CORS 白名单、PBKDF2 |
| 通知 | 浏览器桌面通知、提示音、Web Push；通知入口在右上角铃铛菜单 |
| 管理 | 系统设置、账户权限、角色权限、注册码、数据分析；支持按用户独立允许/禁止权限 |

## 截图

### 收件箱

![收件箱](doc/demo/otsmail-inbox.png)

### 邮件详情

![邮件详情](doc/demo/otsmail-detail.png)

### 深色模式

![深色模式](doc/demo/otsmail-dark.png)

### 系统设置

![系统设置](doc/demo/otsmail-settings.png)

### 移动端

![移动端](doc/demo/otsmail-mobile.png)

## 架构

```text
Cloudflare Email Routing
        │
        ▼
   otsmail Worker ────── D1（邮件/用户/设置/权限）
        │       ├────── KV（缓存/验证码/Push 订阅）
        │       └────── R2（附件/背景图/前端静态资源）
        │
        ├── Resend / Cloudflare Email Service（发信）
        ├── DeepL（翻译）
        ├── OpenAI 兼容 API / Workers AI（AI）
        └── Telegram Bot（远程管理）
```

前端是 `mail-vue`（Vue 3 + Element Plus），后端是 `mail-worker`（Hono + Drizzle + Cloudflare bindings）。

## 快速开始

### 环境

- Node.js 20+
- pnpm
- Cloudflare 账号
- 已登录 Wrangler：`npx wrangler login`
- 一个可接入 Cloudflare Email Routing 的域名

### 一键部署（Windows PowerShell）

先在 `mail-worker` 安装依赖：

```powershell
cd mail-worker
pnpm install
cd ..
```

然后执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

脚本会询问邮箱域名和管理员邮箱，并自动：

1. 创建独立的 D1 / KV / R2；
2. 生成 `mail-worker/wrangler.oneclick.toml`（不会改现有 `wrangler.toml`）；
3. 安装并构建前端；
4. 部署 Worker；
5. 写入 `jwt_secret` 和独立的 `init_secret`；
6. 上传 `mail-worker/dist` 到 R2；
7. 调用 `/api/init` 并携带 `X-Init-Secret` 请求头初始化数据库（只允许一次）。

也可以非交互传参：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 `
  -WorkerName otsmail-demo `
  -Domains example.com `
  -AdminEmail admin@example.com
```

只检查参数、不创建资源：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -DryRun `
  -Domains example.com -AdminEmail admin@example.com
```

> 一键脚本不修改现有 `mail-worker/wrangler.toml`。如果账号里已经有同名 `otsmail` 资源，请换 `-WorkerName`，否则脚本会停止，避免误绑已有邮箱。
>
> Cloudflare 账号没有创建 D1 的权限时，脚本会停在 D1 步骤；这是账号权限问题，不会影响已有站点。

### 手动部署

```bash
git clone https://github.com/otscup/otsmail.git
cd otsmail/mail-worker

npx wrangler d1 create otsmail
npx wrangler kv namespace create otsmail-kv
npx wrangler r2 bucket create otsmail-r2
```

把生成的 D1 / KV / R2 ID 填入 `mail-worker/wrangler.toml`，然后：

```bash
npx wrangler secret put jwt_secret
npx wrangler secret put init_secret
npx wrangler deploy
cd ../mail-vue
pnpm install
pnpm build
```

前端构建产物会写入 `mail-worker/dist`，随 Worker 一起部署，或上传到 R2 由 Worker 提供静态资源。

首次部署后访问：

```bash
curl -H "X-Init-Secret: <init_secret>" https://<你的域名>/api/init
```

然后在 Cloudflare Dashboard → Email Routing 里把邮箱域名的 catch-all 指向 `otsmail` Worker。

### 发信与附件

- 发信需要配置 Resend 或 Cloudflare Email Service 的发信凭据。
- R2 需要绑定公开访问域名，并在后台配置 `r2_domain`；否则附件、背景图和部分静态资源无法显示。
- 自定义域名在 Worker 的 Settings → Domains & Routes 绑定。

## 部署成本

收信、发信、附件和数据库是四个独立计费面；个人用量通常可以停在免费额度内，长期主邮箱要把 D1 行读取和附件存储算进去。

| 项目 | 依赖 | 免费额度 / 包含 | 超出后 | 备注 |
|---|---|---|---|---|
| 收信 | Cloudflare Email Routing | 免费 | 无按封计费 | catch-all 指向 Worker；单封入站上限 25 MiB |
| 收信处理 | Workers | 10 万请求/天、10ms CPU/请求（Free） | Workers Paid 从 $5/月起，按请求/CPU 计费 | 收信、API、静态资源都走 Worker |
| 邮件/用户数据 | D1 | 500 万行读取/天、10 万行写入/天、5GB | D1 Paid 从 $5/月起，按行读取/写入和存储计费 | 列表和计数是主要读放大；当前已有计数/总数 60 秒缓存 |
| 缓存/登录态/Push | KV | 10 万读/天、1000 写/天、1GB | 按 Workers/KV 价格页 | 登录态和验证码必需；不是长期数据备份 |
| 附件/背景/前端 | R2 | 10GB 存储/月、100 万 Class A、1000 万 Class B | 存储约 $0.015/GB/月；Class A/B 按操作计费 | **附件存 R2，不存 D1**；出站流量免费 |
| 发信 | Resend 或 Cloudflare Email Service | Resend 免费约 3000 封/月、100 封/天 | Resend Pro 约 $20/月 5 万封；Cloudflare 按套餐 | 发信和收信不是同一个服务；未配置就只能收不能发 |
| AI / 翻译 | OpenAI 兼容 API、DeepL | 取决于供应商 | 按 token/字符计费 | 可在系统设置关闭，关闭后不产生调用 |
| 域名 / DNS | 域名注册商、Cloudflare DNS | DNS 免费 | 域名年费 | Email Routing、自定义域不额外收费 |

> 以上是写文档时的公开额度，实际账单以 Cloudflare / Resend 控制台和价格页为准。免费额度不是“无限邮箱”：D1 的 500 万行/天是**全站合计**，多个用户、频繁刷新会一起消耗。

### 成本上的几个判断

- **只收发少量邮件**：Email Routing + Workers Free + D1 Free + R2 10GB 通常为 $0；附件不大时 R2 也难超。
- **做主邮箱**：至少准备 Workers Paid + D1 Paid；Resend 免费额度只适合低发信量。最容易被忽略的是 D1 行读取，而不是附件流量。
- **附件很多**：成本主要在 R2 存储；R2 出站免费，但公开附件域名被刷会消耗 Class B 操作。
- **多人使用**：每个用户都会增加 D1 查询和 KV 登录态；免费额度按账号合计，不按用户拆分。

## 备份、恢复与迁移

### 先明确 backup 里有什么

- **D1**：用户、角色/权限、邮件正文与元数据、附件元数据、系统设置（不含 Worker secret 明文）。
- **R2**：附件、正文内嵌图片、背景图、前端静态资源；附件 key 必须原样保留，否则数据库里的引用会断。
- **KV**：登录态、验证码、缓存、Push 订阅等，属于可重建数据，通常不备份；恢复后用户重新登录即可。
- **不包含**：Worker secrets（`jwt_secret`、`init_secret`、Resend/DeepL/AI key）和原始 RFC822 `.eml`。当前入库的是解析后的 HTML/text；**要逐封导出 `.eml` 做迁移，需要另加原始 MIME 归档，现有备份做不到**。

### 建议的备份节奏

- 每天或每周导出一次 D1；附件按周做增量同步。
- 重要操作（升级、迁移、批量删信）前手动做一次全量。
- D1 使用 Cloudflare Time Travel 做短期回滚；R2 可开对象版本控制，防止误删/覆盖。
- 备份文件至少留两份：本机 + 另一个云存储；不要只留在同一台机器。

### D1 导出

在 `mail-worker` 目录执行（把 `otsmail` 换成实际 D1 名称）：

```bash
mkdir -p backup
npx wrangler d1 export otsmail --remote --output backup/otsmail-$(date +%Y%m%d).sql
```

导出的是 SQL（schema + data），可以用文本编辑器检查，也可以直接恢复到新 D1。

### R2 附件同步

推荐用 `rclone`（先配置一个 R2 remote，例如 `r2:`）：

```bash
rclone sync r2:mail-r2/attachments ./backup/attachments --progress
rclone sync r2:mail-r2/background  ./backup/background  --progress
```

如果暂时没有 rclone，可以对单个对象用 `npx wrangler r2 object get mail-r2/attachments/<key> --file ...`，但不适合全量备份。

### Worker 配置和 secret

`wrangler.toml` 里的 D1/KV/R2 binding、域名、`admin` 可以进 Git；**secret 值不要进 Git**。至少把这些名称和值存进密码管理器：

```text
jwt_secret
init_secret
resend_webhook_secret（如启用 Resend 回调）
DeepL / AI / OAuth 等供应商密钥
```

换机或灾备时，`jwt_secret` 保持一致可以保留现有登录态；换掉则所有会话失效，需要重新登录。

### Resend 回调签名

`resend_webhook_secret` 的值来自 Resend 控制台的 Webhook Signing Secret，不是 Resend API Key：

1. Resend Dashboard → Webhooks → 对应 endpoint → 复制 **Signing Secret**（`whsec_...`）。
2. 写入 Worker secret：

   ```bash
   cd mail-worker
   npx wrangler secret put resend_webhook_secret
   ```

   也可以在 Cloudflare Dashboard → Workers & Pages → `otsmail` → Settings → Variables and Secrets → 添加加密变量 `resend_webhook_secret`。

3. 未配置时 `/api/webhooks` 返回 503；配置后空/错误签名返回 401，合法 Svix 签名才处理事件。

### 恢复到新环境

1. 新建 D1 / KV / R2，把新 ID 写进 `mail-worker/wrangler.toml`。
2. 恢复 D1（全量 SQL 已含 schema 时，不要再跑 `/api/init`）：

   ```bash
   npx wrangler d1 execute otsmail --remote --file backup/otsmail-YYYYMMDD.sql
   ```

3. 恢复附件，保持 `attachments/` 前缀和对象 key 不变：

   ```bash
   rclone sync ./backup/attachments r2:mail-r2/attachments --progress
   ```

4. 重新写入 Worker secrets（值从密码管理器取），部署 Worker 和前端。
5. 全量 SQL 已包含 schema，写入 `init_done=1`，避免再次初始化：

   ```bash
   npx wrangler kv key put --binding=kv init_done 1 --remote
   ```

6. 配置 Email Routing catch-all、R2 公开域名、自定义域；登录后检查邮件列表、附件、发信和权限。
7. 恢复后先用测试邮件验证收信/发信，再切换 MX；旧邮箱的 MX 记录变更不会自动搬走旧邮件。

### 迁移到别的服务

当前没有 IMAP/SMTP 服务端，也没有原始 `.eml` 归档，所以“迁去别的邮箱”不能只靠 D1 SQL：

- 能带走：D1 里的用户/邮件正文/元数据、R2 里的附件和图片、系统设置。
- 带不走：原始 MIME、收件时间以外的协议级信息、对方服务器的 IMAP 文件夹结构。
- 如果目标是另一个 IMAP 邮箱，建议在源头（原邮箱提供商）做 IMAP 导出，或先给 otsmail 加“收信时同时保存 `.eml` 到 R2”的归档功能，再谈完整迁移。

## 配置

第一次登录后进入：

`系统设置 / 账户权限 / 权限身份 / 注册码 / 数据分析`

- **系统设置**：站点、注册、邮箱、AI、Telegram、MCP、通知、对象存储。
- **账户权限**：用户列表；每行“操作”→“独立权限”可按用户设置继承/允许/禁止。
- **权限身份**：角色权限、发信额度、发信类型、账户数量、可用域名。
- **数据分析**：收发趋势、分类分布、域名分布。

## 安全说明

- 邮件 HTML 使用 DOMPurify + Shadow DOM，禁止脚本、iframe、表单和危险协议。
- 附件预览按类型走图片/PDF/文本/CSV/Markdown/Office；HTML/SVG 等可执行类型不内联打开，下载走 Blob；PDF/文本 iframe 带 `sandbox`。
- R2 附件仍是公开对象：链接只要外泄就可能被直接读取；不要把附件 URL 当成访问控制。需要强隔离时，应改成鉴权下载或短期签名 URL，并使用独立附件域名。
- 登录连续失败会锁定并发送 Telegram 告警。
- 密码使用 PBKDF2，Token 存储做了本地加密。
- 支持 2FA、OIDC + PKCE、登录态绑定、账户级独立权限。
- Resend 回调必须配置 `resend_webhook_secret`；当前未配置时仍处于 fail-open（会放行），这是已知待收口项，生产环境应尽快补上。
- Telegram webhook 使用独立 secret，但旧 `jwt_secret` 仍保留兼容；在系统设置里重新保存一次 webhook 后，建议下一版移除兼容分支。
- Telegram 邮件查看链接 24 小时过期；旧链接失效属预期。
- 管理员以角色 `type=0` 判定；从旧版本升级后，管理员需要重新登录一次。Worker 变量 `admin` 必须与登录邮箱完全一致。
- 生产部署请使用独立 `jwt_secret`，不要提交任何密钥或 `.dev.vars`。

## 限制

- Cloudflare Worker 不能直接建立 IMAP/SMTP TCP 连接；如需接入外部邮箱、Docker/Linux 部署，需要单独的 Node 邮件桥接服务。
- Cloudflare Email Service 当前只适合出站发信，不是收件 IMAP 服务。
- D1 免费额度为每天 500 万行读取；邮箱量增大后列表和计数会增长，现有计数/总数缓存为 60 秒，仍建议把后台刷新调到 5–15 分钟、使用归档/自动清理，必要时升级 Workers Paid。
- 收信时保存的是解析后的 HTML/text 和附件，不是原始 `.eml`；完整迁移需要额外做 MIME 归档。
- 模板、定时发送尚未实现；签名、图片/PDF/文本/CSV/Markdown/Office 预览、全屏预览已实现。

## 开发

```bash
cd mail-worker && pnpm install && pnpm test
cd ../mail-vue && pnpm install && pnpm build
cd ../mail-worker && npx wrangler deploy --dry-run
```

## License

MIT，见 [LICENSE](LICENSE)。原项目版权归 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 作者所有。
