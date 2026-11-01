param(
  [string]$WorkerName = 'otsmail',
  [string]$Domains = '',
  [string]$AdminEmail = '',
  [string]$JwtSecret = '',
  [switch]$DryRun,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$wrangler = Join-Path $root 'mail-worker\node_modules\wrangler\bin\wrangler.js'
if (-not (Test-Path $wrangler)) { throw '未安装依赖：请先在 mail-worker 执行 pnpm install' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '未找到 Node.js' }

function Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Run-Wrangler([string[]]$arguments) {
  & node $wrangler @arguments
  if ($LASTEXITCODE -ne 0) { throw "wrangler $($arguments -join ' ') 失败" }
}
function Invoke-WranglerText([string[]]$arguments) {
  $text = (& node $wrangler @arguments 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "wrangler $($arguments -join ' ') 失败`n$text" }
  return $text
}

if (-not $DryRun) {
  Step '检查 Cloudflare 登录状态'
  $who = (& node $wrangler whoami 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "wrangler 未登录：请先执行 npx wrangler login`n$who" }
  Write-Host $who
}

if (-not $Domains) { $Domains = Read-Host '邮箱域名（多个用逗号分隔，例如 example.com,mail.example.com）' }
$domainList = @($Domains -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($domainList.Count -eq 0) { throw '至少需要一个邮箱域名' }
if (-not $AdminEmail) { $AdminEmail = Read-Host '管理员邮箱（例如 admin@example.com）' }
if ($AdminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "管理员邮箱格式不正确: $AdminEmail" }
if (-not $JwtSecret) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $JwtSecret = ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

$initBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($initBytes)
$InitSecret = ([BitConverter]::ToString($initBytes) -replace '-', '').ToLower()

$d1Name = $WorkerName
$kvName = "$WorkerName-kv"
$bucket = "$WorkerName-r2"
$configPath = Join-Path $root 'mail-worker\wrangler.oneclick.toml'
$dist = Join-Path $root 'mail-worker\dist'

if ($DryRun) {
  Write-Host "DRY RUN: 将创建 D1=$d1Name KV=$kvName R2=$bucket"
  Write-Host "域名: $($domainList -join ', ')"; Write-Host "管理员: $AdminEmail"; Write-Host "配置: $configPath"
  exit 0
}

Step "创建 D1: $d1Name"
$d1Text = Invoke-WranglerText @('d1', 'create', $d1Name)
$d1Id = [regex]::Match($d1Text, 'database_id\s*=\s*"([^"]+)"').Groups[1].Value
if (-not $d1Id) { throw "创建 D1 成功但无法解析 ID：`n$d1Text" }

Step "创建 KV: $kvName"
$kvText = Invoke-WranglerText @('kv', 'namespace', 'create', $kvName)
$kvId = [regex]::Match($kvText, 'id\s*=\s*"([^"]+)"').Groups[1].Value
if (-not $kvId) { throw "创建 KV 成功但无法解析 ID：`n$kvText" }

Step "创建 R2: $bucket"
Invoke-WranglerText @('r2', 'bucket', 'create', $bucket) | Out-Null

$domainToml = ($domainList | ForEach-Object { '"' + $_ + '"' }) -join ', '
$config = @"
# 由 scripts/install.ps1 生成；不要提交（.gitignore 已忽略）
name = "$WorkerName"
main = "src/index.js"
compatibility_date = "2025-06-04"
compatibility_flags = ["nodejs_compat"]
keep_vars = true

[observability]
enabled = true

[[d1_databases]]
binding = "db"
database_name = "$d1Name"
database_id = "$d1Id"

[[kv_namespaces]]
binding = "kv"
id = "$kvId"

[[r2_buckets]]
binding = "r2"
bucket_name = "$bucket"

[ai]
binding = "ai"

[vars]
pwd_iterations = 8000
domain = [$domainToml]
admin = "$AdminEmail"
mcp_switch = false
github_switch = false
google_switch = false
"@
[IO.File]::WriteAllText($configPath, $config, (New-Object Text.UTF8Encoding($false)))
Write-Host "写入 $configPath"

if (-not $SkipBuild) {
  Step '安装依赖并构建前端'
  & pnpm --dir mail-vue install
  if ($LASTEXITCODE -ne 0) { throw 'mail-vue pnpm install 失败' }
  & pnpm --dir mail-vue build
  if ($LASTEXITCODE -ne 0) { throw 'mail-vue build 失败' }
}

Step '部署 Worker'
$deployText = (& node $wrangler deploy --config $configPath 2>&1 | Tee-Object -Variable deployLines | Out-String)
Write-Host $deployText
if ($LASTEXITCODE -ne 0) { throw 'Worker 部署失败' }
$workerUrl = [regex]::Match($deployText, 'https://[A-Za-z0-9.-]+\.workers\.dev').Value
if (-not $workerUrl) { $workerUrl = Read-Host '未从部署日志识别 workers.dev 地址，请粘贴 Worker URL（可留空）' }

Step '写入 jwt_secret'
$JwtSecret | & node $wrangler secret put jwt_secret --config $configPath
if ($LASTEXITCODE -ne 0) { throw 'jwt_secret 写入失败' }

Step '写入 init_secret'
$InitSecret | & node $wrangler secret put init_secret --config $configPath
if ($LASTEXITCODE -ne 0) { throw 'init_secret 写入失败' }

Step '上传前端到 R2'
& (Join-Path $PSScriptRoot 'upload-web.ps1') -Dist $dist -Bucket $bucket -Prefix web -Config $configPath

if ($workerUrl) {
  Step '初始化数据库'
  try {
    $init = Invoke-WebRequest -UseBasicParsing "$workerUrl/api/init/$InitSecret" -TimeoutSec 120
    Write-Host "init: $($init.StatusCode) $($init.Content)"
  } catch {
    Write-Warning "自动初始化失败，请手动访问 $workerUrl/api/init/<init_secret>（已写入 Worker secret）：$_"
  }
}

Write-Host @"

部署完成。
- Worker: $workerUrl
- D1: $d1Name ($d1Id)
- KV: $kvName ($kvId)
- R2: $bucket
- 配置: $configPath

还需要手动完成：
1. Cloudflare Dashboard → Email Routing：把邮箱域名的 catch-all 指向 Worker `$WorkerName`。
2. R2 绑定一个公开域名，并在后台设置 r2_domain；否则附件/背景图无法访问。
3. 需要发信时在后台配置 Resend/Cloudflare Email Service。
4. 如需自定义域名，在 Worker 的 Settings → Domains & Routes 绑定。
"@
