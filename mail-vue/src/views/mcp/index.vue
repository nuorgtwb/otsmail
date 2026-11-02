<template>
  <div class="mcp-admin">
    <settingsTabs/>
    <el-scrollbar class="scrollbar">
      <div class="page">

        <div class="card status-card">
          <div class="status-head">
            <div class="title">{{ $t('mcpService') }}</div>
            <el-tag :type="status.enabled ? 'success' : 'info'" size="small" round>
              {{ status.enabled ? $t('mcpEnabled') : $t('mcpDisabled') }}
            </el-tag>
          </div>
          <div class="stats">
            <div class="stat">
              <div class="num">{{ status.activeTokenCount }}<span class="dim">/{{ status.tokenCount }}</span></div>
              <div class="lbl">{{ $t('mcpTokenCount') }}</div>
            </div>
            <div class="stat">
              <div class="num">{{ status.clientCount }}</div>
              <div class="lbl">{{ $t('mcpOauthClients') }}</div>
            </div>
            <div class="stat wide">
              <div class="num small">{{ status.lastUsedAt ? fmt(status.lastUsedAt) : $t('mcpNeverUsed') }}</div>
              <div class="lbl">{{ $t('mcpLastUsed') }}</div>
            </div>
          </div>
          <div class="endpoint">
            <span class="k">{{ $t('mcpEndpoint') }}</span>
            <code>{{ status.endpoint }}</code>
          </div>
          <div class="mcp-help">
            <p>连接时不要再填邮箱密码。支持自定义请求头的客户端填上方地址，并加请求头
              <code>Authorization: Bearer &lt;新建的 mcp_ 令牌&gt;</code>。</p>
            <p>不能自定义请求头的客户端，直接把令牌拼进地址：
              <code>{{ status.endpoint }}?token=&lt;新建的 mcp_ 令牌&gt;</code>（地址栏或客户端 URL 栏都行，不要再填邮箱密码）。</p>
            <p>只支持 OAuth 的客户端用下方 OAuth 客户端 ID/Secret 走
              <code>client_credentials</code>，Token 地址：<code>{{ status.endpoint.replace('/mcp', '/api/oauth/mcp/token') }}</code>。</p>
          </div>
        </div>

        <div class="card">
          <div class="section-head">
            <div class="title">{{ $t('mcpTokens') }}</div>
            <el-button type="primary" size="small" round @click="openCreateToken">
              {{ $t('mcpNewToken') }}
            </el-button>
          </div>
          <el-table :data="tokens" class="table" :show-header="true">
            <el-table-column prop="name" :label="$t('mcpTokenName')" min-width="150" show-overflow-tooltip/>
            <el-table-column :label="$t('mcpTokenPrefix')" min-width="150">
              <template #default="{ row }"><code class="mono">{{ row.tokenPrefix }}…</code></template>
            </el-table-column>
            <el-table-column :label="$t('mcpCreateTime')" min-width="145">
              <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column :label="$t('mcpLastUsed')" min-width="145">
              <template #default="{ row }">{{ row.lastUsedAt ? fmt(row.lastUsedAt) : $t('mcpNeverUsed') }}</template>
            </el-table-column>
            <el-table-column :label="$t('mcpStatusLabel')" width="96">
              <template #default="{ row }">
                <el-tag :type="row.revoked ? 'info' : 'success'" size="small" round>
                  {{ row.revoked ? $t('mcpRevoked') : $t('mcpActive') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column width="90" align="right">
              <template #default="{ row }">
                <el-button v-if="!row.revoked" link type="danger" @click="revokeToken(row)">
                  {{ $t('mcpRevoke') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="card">
          <div class="section-head">
            <div class="title">{{ $t('mcpOauthClients') }}</div>
            <el-button size="small" round @click="openCreateClient">{{ $t('mcpNewClient') }}</el-button>
          </div>
          <el-table :data="clients" class="table">
            <el-table-column :label="$t('mcpClientId')" min-width="190">
              <template #default="{ row }"><code class="mono">{{ row.clientId }}</code></template>
            </el-table-column>
            <el-table-column prop="name" :label="$t('mcpTokenName')" min-width="150" show-overflow-tooltip/>
            <el-table-column :label="$t('mcpCreateTime')" min-width="145">
              <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column :label="$t('mcpStatusLabel')" width="96">
              <template #default="{ row }">
                <el-tag :type="row.revoked ? 'info' : 'success'" size="small" round>
                  {{ row.revoked ? $t('mcpRevoked') : $t('mcpActive') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column width="90" align="right">
              <template #default="{ row }">
                <el-button v-if="!row.revoked" link type="danger" @click="revokeClient(row)">
                  {{ $t('mcpRevoke') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

      </div>
    </el-scrollbar>

    <el-dialog v-model="createTokenVisible" :title="$t('mcpNewToken')" width="420px">
      <el-input v-model="tokenName" :placeholder="$t('mcpTokenNamePlaceholder')" @keyup.enter="submitToken"/>
      <template #footer>
        <el-button @click="createTokenVisible = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submitToken">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="tokenOnceVisible" :title="$t('mcpTokenOnceTitle')" width="480px">
      <div class="once-desc">{{ $t('mcpTokenOnceDesc') }}</div>
      <div class="once-value">
        <code>{{ createdToken }}</code>
        <el-button link type="primary" @click="copy(createdToken)">{{ $t('copy') }}</el-button>
      </div>
      <div class="once-desc" style="margin-top:10px">{{ $t('mcpEndpoint') }}</div>
      <div class="once-value">
        <code>{{ status.endpoint }}?token={{ createdToken }}</code>
        <el-button link type="primary" @click="copy(`${status.endpoint}?token=${createdToken}`)">{{ $t('copy') }}</el-button>
      </div>
      <template #footer>
        <el-button type="primary" @click="tokenOnceVisible = false">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createClientVisible" :title="$t('mcpNewClient')" width="420px">
      <el-input v-model="clientName" :placeholder="$t('mcpClientNamePlaceholder')" @keyup.enter="submitClient"/>
      <template #footer>
        <el-button @click="createClientVisible = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submitClient">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="clientOnceVisible" :title="$t('mcpClientOnceTitle')" width="480px">
      <div class="once-desc">{{ $t('mcpClientOnceDesc') }}</div>
      <div class="once-row">
        <span class="k">{{ $t('mcpClientId') }}</span>
        <code>{{ createdClient.clientId }}</code>
        <el-button link type="primary" @click="copy(createdClient.clientId)">{{ $t('copy') }}</el-button>
      </div>
      <div class="once-row">
        <span class="k">{{ $t('mcpClientSecret') }}</span>
        <code>{{ createdClient.clientSecret }}</code>
        <el-button link type="primary" @click="copy(createdClient.clientSecret)">{{ $t('copy') }}</el-button>
      </div>
      <template #footer>
        <el-button type="primary" @click="clientOnceVisible = false">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {defineOptions, reactive, ref} from "vue"
import {useI18n} from "vue-i18n"
import {clientCreate, clientList, clientRevoke, mcpStatus, tokenCreate, tokenList, tokenRevoke} from "@/request/mcp.js"
import {tzDayjs} from "@/utils/day.js"

defineOptions({
  name: 'mcp'
})

const {t} = useI18n()

const status = reactive({
  enabled: false, endpoint: '', tokenCount: 0, activeTokenCount: 0, clientCount: 0, lastUsedAt: null
})
const tokens = reactive([])
const clients = reactive([])
const submitting = ref(false)
const createTokenVisible = ref(false)
const tokenOnceVisible = ref(false)
const createClientVisible = ref(false)
const clientOnceVisible = ref(false)
const tokenName = ref('')
const clientName = ref('')
const createdToken = ref('')
const createdClient = reactive({clientId: '', clientSecret: ''})

loadAll()

function fmt(value) {
  if (!value) return '-'
  const d = tzDayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(value)
}

async function loadAll() {
  const info = await mcpStatus()
  Object.assign(status, info)
  const [tokenRows, clientRows] = await Promise.all([tokenList(), clientList()])
  tokens.length = 0
  tokens.push(...tokenRows)
  clients.length = 0
  clients.push(...clientRows)
}

function openCreateToken() {
  tokenName.value = ''
  createTokenVisible.value = true
}

function submitToken() {
  if (submitting.value) return
  if (!tokenName.value.trim()) {
    ElMessage({message: t('mcpEmptyName'), type: 'error', plain: true})
    return
  }
  submitting.value = true
  tokenCreate({name: tokenName.value.trim()}).then(data => {
    createTokenVisible.value = false
    createdToken.value = data.token
    tokenOnceVisible.value = true
    ElMessage({message: t('mcpCreateSuccess'), type: 'success', plain: true})
    return loadAll()
  }).finally(() => {
    submitting.value = false
  })
}

function openCreateClient() {
  clientName.value = ''
  createClientVisible.value = true
}

function submitClient() {
  if (submitting.value) return
  if (!clientName.value.trim()) {
    ElMessage({message: t('mcpEmptyName'), type: 'error', plain: true})
    return
  }
  submitting.value = true
  clientCreate({name: clientName.value.trim()}).then(data => {
    createClientVisible.value = false
    createdClient.clientId = data.clientId
    createdClient.clientSecret = data.clientSecret
    clientOnceVisible.value = true
    ElMessage({message: t('mcpCreateSuccess'), type: 'success', plain: true})
    return loadAll()
  }).finally(() => {
    submitting.value = false
  })
}

function revokeToken(row) {
  ElMessageBox.confirm(t('mcpRevokeConfirm', {name: row.name}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    tokenRevoke(row.tokenId).then(() => {
      ElMessage({message: t('mcpRevokeSuccess'), type: 'success', plain: true})
      loadAll()
    })
  })
}

function revokeClient(row) {
  ElMessageBox.confirm(t('mcpRevokeConfirm', {name: row.name}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    clientRevoke(row.clientId).then(() => {
      ElMessage({message: t('mcpRevokeSuccess'), type: 'success', plain: true})
      loadAll()
    })
  })
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage({message: t('copySuccessMsg'), type: 'success', plain: true})
  } catch (e) {
    ElMessage({message: '复制失败', type: 'error', plain: true})
  }
}
</script>

<style scoped lang="scss">
.mcp-admin {
  height: 100%;
  overflow: hidden;
}

.scrollbar {
  height: 100%;
  background: var(--bg-grouped);
}

.page {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 1080px;
  margin: 0 auto;
}

.card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: 0 0 0 0.5px var(--separator);
}

.status-head,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.section-head {
  margin-bottom: var(--space-2);
}

.title {
  font-size: var(--text-headline);
  font-weight: 600;
  color: var(--label);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  margin-top: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 0.5px solid var(--separator);
  border-bottom: 0.5px solid var(--separator);
}

.stat {
  min-width: 96px;

  &.wide {
    flex: 1;
  }

  .num {
    font-size: 24px;
    font-weight: 600;
    color: var(--label);
    line-height: 1.2;

    &.small {
      font-size: var(--text-subhead);
      font-weight: 500;
      padding-top: 6px;
    }
  }

  .dim {
    font-size: var(--text-footnote);
    color: var(--label-3);
    margin-left: 2px;
  }

  .lbl {
    font-size: var(--text-footnote);
    color: var(--label-2);
    margin-top: 2px;
  }
}

.endpoint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  min-height: 44px;
  font-size: var(--text-footnote);

  .k {
    color: var(--label-2);
  }

  code {
    color: var(--blue);
    word-break: break-all;
  }
}

.mcp-help {
  margin-top: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-grouped);
  font-size: var(--text-footnote);
  color: var(--label-2);
  line-height: 1.6;

  p { margin: 0 0 6px; }
  p:last-child { margin-bottom: 0; }
  code { color: var(--blue); word-break: break-all; }
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--text-footnote);
  color: var(--label-2);
}

.once-desc {
  font-size: var(--text-footnote);
  color: var(--label-2);
  margin-bottom: var(--space-3);
  line-height: 1.5;
}

.once-value,
.once-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--fill-quaternary);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin-bottom: var(--space-2);
  min-height: 44px;

  code {
    flex: 1;
    word-break: break-all;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--text-footnote);
    color: var(--label);
  }

  .k {
    color: var(--label-2);
    font-size: var(--text-footnote);
    white-space: nowrap;
  }
}

:deep(.el-table) {
  --el-table-border-color: var(--separator);
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  background: transparent;
}

:deep(.el-table__inner-wrapper:before) {
  display: none;
}

:deep(.el-table th.el-table__cell) {
  background: transparent;
  color: var(--label-2);
  font-weight: 500;
}

:deep(.el-table td.el-table__cell),
:deep(.el-table th.el-table__cell) {
  border-bottom: 0.5px solid var(--separator);
}
</style>
