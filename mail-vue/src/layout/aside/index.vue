<template>
  <el-scrollbar class="scroll">
    <div>
      <div class="title" >
        <div class="brand-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="4" stroke="currentColor" stroke-width="1.8"/>
            <path d="M4.5 8l7.5 5.4L19.5 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="title-text">
          <div class="title-main">OTSCUP</div>
          <div class="title-sub">MAIL CLIENT</div>
        </div>
      </div>
      <button type="button" class="compose-btn" @click="openCompose">
        <Icon icon="material-symbols:add-rounded" width="20" height="20"/>
        <span>Compose <small>写邮件</small></span>
      </button>
      <div class="acct" v-perm="'account:query'">
        <button type="button" class="acct-toggle" @click="toggleAcct">
          <Icon icon="mdi:account-multiple-outline" width="18" height="18"/>
          <span class="acct-label">Accounts <small>邮箱账户</small></span>
          <Icon class="acct-chevron" :class="{ open: acctOpen }" icon="mingcute:down-small-fill" width="18" height="18"/>
        </button>
        <el-collapse-transition>
          <div class="acct-panel" v-show="acctOpen">
            <button type="button" class="all-accounts" @click="router.push('/all-email')"><Icon icon="mdi:inbox-multiple-outline" width="17" height="17"/><span>All accounts mail <small>所有账户邮件</small></span></button>
            <Account/>
          </div>
        </el-collapse-transition>
      </div>
      <el-menu :collapse="false" text-color="var(--label)" active-text-color="var(--blue)" style="margin-top: 10px">
        <el-menu-item @click="router.push({name: 'email'})" index="email"
                      :class="route.meta.name === 'email' ? 'choose-item' : ''">
          <Icon icon="mdi:email-outline" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px"><b>Inbox</b><small>{{$t('inbox')}}</small></span>
          <span class="menu-badge" v-if="counts.inbox">{{ counts.inbox }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'unread'})" index="unread"
                      :class="route.meta.name === 'unread' ? 'choose-item' : ''">
          <Icon icon="mdi:email-open-outline" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px"><b>Unread</b><small>{{$t('unreadList')}}</small></span>
          <span class="menu-badge" v-if="counts.inbox">{{ counts.inbox }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'spam'})" index="spam"
                      :class="route.meta.name === 'spam' ? 'choose-item' : ''">
          <Icon icon="mdi:alert-octagon-outline" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px"><b>Spam</b><small>{{$t('spamList')}}</small></span>
          <span class="menu-badge" v-if="counts.spam">{{ counts.spam }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'deleted'})" index="deleted"
                      :class="route.meta.name === 'deleted' ? 'choose-item' : ''">
          <Icon icon="mdi:trash-can-outline" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px"><b>Trash</b><small>{{$t('deletedList')}}</small></span>
          <span class="menu-badge" v-if="counts.deleted">{{ counts.deleted }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="route.meta.name === 'send' ? 'choose-item' : ''">
          <Icon icon="cil:send" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px"><b>Sent</b><small>{{$t('sent')}}</small></span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="route.meta.name === 'draft' ? 'choose-item' : ''">
          <Icon icon="ep:document" width="19" height="19" />
          <span class="menu-name" style="margin-left: 22px"><b>Drafts</b><small>{{$t('drafts')}}</small></span>
          <span class="menu-badge" v-if="counts.drafts">{{ counts.drafts }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'contacts'})" index="contacts">
          <Icon icon="hugeicons:contact-01" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px"><b>Contacts</b><small>联系人</small></span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'star'})" index="star"
                      :class="route.meta.name === 'star' ? 'choose-item' : ''">
          <Icon icon="solar:star-line-duotone" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px"><b>Starred</b><small>{{$t('starred')}}</small></span>
        </el-menu-item>
      </el-menu>
    </div>
    <div class="side-footer">
      <button type="button" class="side-foot-btn" @click="router.push({name:'setting'})">
        <Icon icon="fluent:settings-48-regular" width="18" height="18"/><span>Settings <small>设置</small></span>
      </button>
      <button type="button" class="side-foot-btn" @click="openHelp">
        <Icon icon="mingcute:question-line" width="18" height="18"/><span>Help <small>帮助</small></span>
      </button>
      <el-dropdown class="side-user-dd" trigger="click" placement="top-start" @command="sideUserCommand">
        <button type="button" class="side-user">
          <span class="side-avatar">
            <img v-if="userStore.user.avatar" :src="userStore.user.avatar" alt=""/>
            <template v-else>{{ userInitial }}</template>
          </span>
          <span class="side-user-text">
            <b>{{ userStore.user.name || 'OTSCUP' }}</b>
            <small>{{ userStore.user.email }}</small>
          </span>
          <Icon icon="mingcute:more-2-fill" width="16" height="16"/>
        </button>
        <template #dropdown>
          <el-dropdown-menu class="side-user-menu">
            <el-dropdown-item disabled>{{ userStore.user.name || 'OTSCUP' }}</el-dropdown-item>
            <el-dropdown-item disabled>{{ userStore.user.email }}</el-dropdown-item>
            <el-dropdown-item divided command="logout">{{ $t('logOut') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </el-scrollbar>
</template>

<script setup>
import router from "@/router/index.js";
import { useRoute } from "vue-router";
import {Icon} from "@iconify/vue";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {computed} from "vue";
import {ref, reactive, onMounted, onUnmounted, watch} from "vue";
import Account from "@/layout/account/index.vue";
import {emailCounts} from "@/request/email.js";
import db from "@/db/db.js";
import {logout} from "@/request/login.js";
import {clearToken} from "@/utils/token-store.js";
import {startEmailEvents, stopEmailEvents} from "@/utils/email-events.js";

const settingStore = useSettingStore();
const uiStore = useUiStore();
const userStore = useUserStore();
const userInitial = computed(() => String(userStore.user.name || userStore.user.email || 'O').trim().charAt(0).toUpperCase());
const loggingOut = ref(false)
async function sideUserCommand(command) {
  if (command !== 'logout' || loggingOut.value) return
  loggingOut.value = true
  logout().catch(() => {})
  clearToken()
  router.replace('/login').finally(() => { loggingOut.value = false })
}
function openCompose(){ uiStore.writerRef?.open?.() }
function openHelp(){ window.open('https://github.com/otscup/otsmail','_blank','noopener,noreferrer') }
const route = useRoute();
const counts = reactive({inbox: 0, sent: 0, deleted: 0, spam: 0, drafts: 0});
let countTimer = null;
const countRefreshMs = computed(() => Math.max(1, Number(settingStore.settings.countRefreshMinutes) || 2) * 60000);
let lastCountsAt = 0; // local throttle: route changes within 30s reuse the last badge snapshot

async function loadCounts(force = false) {
  if (!force && Date.now() - lastCountsAt < 30000) return;
  lastCountsAt = Date.now();
  try {
    const data = await emailCounts();
    Object.assign(counts, data.menu);
  } catch {}
  try {
    counts.drafts = await db.value.draft.count();
  } catch {}
}

onMounted(() => {
  loadCounts();
  countTimer = setInterval(loadCounts, countRefreshMs.value);
  window.addEventListener('otsmail:counts', () => loadCounts(true));
  startEmailEvents(() => {
    loadCounts(true);
    window.dispatchEvent(new CustomEvent('otsmail:email'));
  });
});

onUnmounted(() => {
  clearInterval(countTimer);
  stopEmailEvents();
  window.removeEventListener('otsmail:counts', loadCounts);
});

watch(() => route.name, () => loadCounts());
watch(countRefreshMs, value => {
  clearInterval(countTimer);
  countTimer = setInterval(loadCounts, value);
});
// 瀛愰偖绠遍粯璁ゆ敹璧凤紝灞曞紑鐘舵€佽鍦?localStorage锛堜互鍓嶆瘡娆″埛鏂伴兘灞曞紑锛屽緢纰嶄簨锛?
const acctOpen = ref(localStorage.getItem('acctOpen') === '1');

function toggleAcct() {
  acctOpen.value = !acctOpen.value
  localStorage.setItem('acctOpen', acctOpen.value ? '1' : '0')
}

</script>

<style lang="scss" scoped>

.acct {
  margin: 0 10px 6px;
}

.acct-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--label-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--fill-quaternary);
  }
}

.acct-label {
  flex: 1;
  text-align: left;
}

.acct-chevron {
  color: var(--label-3);
  transition: transform .15s;
}

.acct-chevron.open {
  transform: rotate(180deg);
}

.acct-panel {
  margin-top: 4px;
  max-height: 38vh;
  overflow: hidden;
}

:deep(.account-box) {
  border-right: 0 !important;
  background: transparent;
  display: flex;
  flex-direction: column;
  height: auto;
}

:deep(.account-box .head-opt) {
  height: 30px;
  padding: 0 4px;
  box-shadow: none;
}

/* 璐︽埛澶氭椂鍦ㄩ潰鏉块噷婊氬姩锛屼笉鎶婅彍鍗曟尋涓嬪幓 */
:deep(.account-box .scrollbar) {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  max-height: 30vh;
}

.title {
  margin: 15px 10px;
  height: 54px;
  border-radius: 8px;
  display: flex;
  position: relative;
  font-size: 16px;
  font-weight: bold;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  padding-left: 10px;
  color: #ffffff;
  background: var(--blue);
  transition: all 0.3s ease;
  max-width: 260px;
  padding: 0 12px;
  .title-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .title-main,
  .title-sub {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: calc(260px - 24px - 31px);
  }
  .title-sub {
    font-size: 11px;
    font-weight: 400;
    line-height: 14px;
    opacity: .75;
  }

  :deep(.el-icon) {
    flex-shrink: 0;
    font-size: 20px;
  }

  .user-right-icon {
    align-self: center;
    position: absolute;
    font-size: 12px;
    right: 8px;
    color: #ffffff;
  }

}


.manage-title {
  margin-top: 10px;
  padding-left: 20px;
  color: var(--label-2);
}

/* iOS overrides handle .el-menu-item styling */

.choose-item {
  font-weight: bold;
  background: var(--ots-accent-weak) !important;
  backdrop-filter: blur(4px);
}

@media (hover: hover) and (pointer: fine) {
  :deep(.el-menu-item:hover) {
    background: var(--ots-accent-weak) !important;
    box-shadow: inset 3px 0 0 var(--blue), 0 3px 10px rgba(15, 23, 42, .06);
  }
  :deep(.el-menu-item .iconify) {
    transition: transform .18s cubic-bezier(.22,1.18,.36,1);
  }
  :deep(.el-menu-item:hover .iconify) {
    transform: scale(1.08);
  }
  :deep(.el-menu-item:active) {
    background: color-mix(in srgb, var(--ots-accent-weak) 70%, var(--blue)) !important;
  }
  .acct-toggle:hover {
    background: var(--fill-quaternary);
  }
  .title:hover .title-logo {
    box-shadow: 0 4px 12px rgba(37, 99, 235, .28);
  }
  .collapse-toggle:hover {
    background: var(--fill-quaternary);
    color: var(--blue);
  }
}
.menu-name {
  user-select: none;
  flex: 1;
  min-width: 0;
}

.menu-badge {
  margin-left: auto;
  margin-right: 8px;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.collapse-toggle {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, .18);
  color: #fff;
  cursor: pointer;
}

.title-text {
  flex: 1;
  min-width: 0;
  padding-right: 28px;
  line-height: 1.15;
}

.title-main,
.title-sub {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title-main {
  font-size: 14px;
  font-weight: 700;
}

.title-sub {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 400;
  opacity: .82;
}

.title-logo {
  width: 34px;
  height: 34px;
  margin-left: 8px;
  border-radius: 9px;
  object-fit: cover;
}

:global(.aside-collapsed) .collapse-toggle {
  position: static;
  transform: none;
  margin-left: 0;
  background: transparent;
}

:global(.aside-collapsed) .menu-badge,
:global(.aside-collapsed) .title-text,
:global(.aside-collapsed) .title-logo {
  display: none;
}

:global(.aside-collapsed) .title {
  justify-content: center;
  padding-left: 0;
}


:deep(.el-scrollbar__wrap--hidden-default ) {
  background: transparent !important;
}

:deep(.el-menu-item) {
  background: transparent;
  transition: background .15s ease, box-shadow .18s ease;
}

:deep(.el-menu) {
  background: transparent;
}

.el-menu {
  border-right: 0;
}

:deep(.el-divider__text) {
  background: var(--aside-backgound);
  color: var(--label-2);
}

.scroll {

}

/* v4 sidebar */
.scroll { height:100%; background:var(--rd-panel); }
:deep(.el-scrollbar__view) { min-height:100%; display:flex; flex-direction:column; }
.title { padding:18px 16px 12px !important; margin:0 !important; }
.title-logo { width:34px; height:34px; border-radius:10px; }
.title-main { font-size:15px; font-weight:760; letter-spacing:-.02em; text-align:center; }
.title-sub { font-size:11px; color:var(--rd-muted, var(--label-3)); margin-top:2px; text-align:center; }
.compose-btn { margin:6px 10px 16px; height:48px; border-radius:14px; border:0; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:8px; font-size:13px; font-weight:650; color:#fff;
  background:linear-gradient(135deg,#6ee9ff,#7c7bff); box-shadow:0 8px 22px rgba(99,124,255,.22); }
.compose-btn small { font-weight:500; opacity:.72; }
.compose-btn:active { transform:scale(.97); }
:deep(.el-menu) { margin-top:4px !important; background:transparent !important; border-right:0 !important; }
:deep(.el-menu-item) { height:38px !important; line-height:38px !important; margin:1px 10px !important; border-radius:9px !important; padding:0 10px !important; }
:deep(.el-menu-item:hover) { background:var(--rd-panel-2) !important; }
:deep(.el-menu-item.choose-item) { background:var(--rd-accent-weak, rgba(10,132,255,.12)) !important; color:var(--rd-accent,#0a84ff) !important; font-weight:650; }
:deep(.menu-name) { margin-left:10px !important; font-size:13px !important; display:flex; flex-direction:column; line-height:1.1; }
:deep(.menu-name b) { font-size:12px; font-weight:620; }
:deep(.menu-name small) { font-size:9px; color:var(--rd-muted); margin-top:1px; }
:deep(.menu-badge) { margin-left:auto; min-width:20px; height:18px; line-height:18px; padding:0 6px; border-radius:9px; background:var(--rd-panel-2); color:var(--rd-muted); font-size:10px; }
.acct { margin:2px 10px 4px !important; }
.side-footer { margin-top:auto; padding:10px 12px 14px; border-top:1px solid var(--rd-line); background:var(--rd-panel); position:sticky; bottom:0; }
.side-foot-btn { width:100%; height:34px; border:0; background:transparent; color:var(--rd-muted); border-radius:8px; display:flex; align-items:center; gap:9px; padding:0 8px; cursor:pointer; font-size:12px; }
.side-foot-btn small { opacity:.7; }
.side-foot-btn:hover { background:var(--rd-panel-2); color:var(--rd-text); }
.side-user { width:100%; border:0; background:transparent; display:flex; align-items:center; gap:9px; margin-top:6px; padding:8px; border-radius:11px; cursor:pointer; text-align:left; color:var(--rd-text); }
.side-user:hover { background:var(--rd-panel-2); }
.side-avatar { width:32px; height:32px; border-radius:50%; background:linear-gradient(145deg,#6ee9ff,#7c7bff); display:grid; place-items:center; overflow:hidden; color:#06111d; font-size:11px; font-weight:800; flex:0 0 32px; }
.side-avatar img { width:100%; height:100%; object-fit:cover; }
.side-user-text { min-width:0; flex:1; display:flex; flex-direction:column; }
.side-user-text b { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.side-user-text small { font-size:10px; color:var(--rd-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.all-accounts { width:100%; height:32px; display:flex; align-items:center; gap:8px; padding:0 8px; margin:2px 0 6px; border:0; border-radius:7px; background:transparent; color:var(--rd-muted); font-size:12px; cursor:pointer; text-align:left; }
.all-accounts:hover { background:var(--rd-panel-2); color:var(--rd-text); }
.all-accounts small { margin-left:auto; font-size:9px; opacity:.6; }
</style>

