<template>
  <div class="header" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <div class="header-btn">
      <hanburger class="header-menu" @click="changeAside"></hanburger>
      <button v-if="showMailSearch" type="button" class="mobile-search-btn" :aria-label="$t('searchMail')" @click="openMobileSearch">
        <Icon icon="mdi:magnify" width="19" height="19"/>
      </button>
      <div v-if="showMailSearch" class="header-search-wrap" :class="{ open: mobileSearchOpen }">
        <EmailSearch
                     class="header-mail-search"
                     :store="emailStore"
                     :search-options="searchOptions"
                     @search="refreshMailList"
                     @reset="refreshMailList"/>
      </div>
      <span v-else class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
      <button v-if="mobileSearchOpen" type="button" class="mobile-search-close" @click="closeMobileSearch"><Icon icon="mdi:close" width="18" height="18"/></button>
    </div>
    <div class="toolbar">
      <button v-perm="'email:send'" type="button" class="writer-box" @click="openSend">
        <Icon icon="material-symbols:edit-outline-sharp" width="18" height="18"/>
        <span class="writer-text">{{ $t('compose') }}</span>
      </button>
      <el-tooltip :content="notifyBlocked ? $t('notificationsBlocked') : (notifyOn ? $t('notificationsOn') : $t('notificationsOff'))" placement="bottom">
        <div class="icon-item notice" @click="toggleNotify">
          <svg viewBox="0 0 24 24" width="20" height="20" :fill="notifyOn ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
            <path d="M10 21h4"/>
            <line v-if="notifyBlocked" x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.8"/>
          </svg>
        </div>
      </el-tooltip>
      <div v-if="uiStore.dark" class="dark-icon icon-item" @click="openDark($event)" title="Light mode">
        <Icon icon="mingcute:moon-fill"/>
      </div>
      <div v-else class="sun-icon icon-item" @click="openDark($event)" title="Dark mode">
        <Icon icon="mingcute:sun-fill"/>
      </div>
      <button type="button" class="lang-toggle" @click="toggleLang">{{ locale === 'en' ? 'EN' : '中' }}</button>
      <div v-perm="'ai:use'" class="header-ai">
        <aiAssistant ref="aiAssistantRef" inline class="header-ai-window"/>
      </div>
      <el-dropdown class="mobile-user-menu" trigger="click" @command="mobileUserCommand">
        <button type="button" class="mobile-avatar" :aria-label="$t('settings')">
          <img v-if="userStore.user.avatar" :src="userStore.user.avatar" alt=""/>
          <span v-else>{{ (userStore.user.name || userStore.user.email || 'A').slice(0,1).toUpperCase() }}</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item disabled>{{ userStore.user.name || 'OTSCUP' }}</el-dropdown-item>
            <el-dropdown-item disabled>{{ userStore.user.email }}</el-dropdown-item>
            <el-dropdown-item divided command="settings">{{ $t('settings') }}</el-dropdown-item>
            <el-dropdown-item command="lang">{{ locale === 'en' ? '中文' : 'English' }}</el-dropdown-item>
            <el-dropdown-item command="logout">{{ $t('logOut') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import EmailSearch from '@/components/email-search/index.vue'
import aiAssistant from '@/components/ai-assistant/index.vue'
import {useEmailStore} from '@/store/email.js';
import {logout} from "@/request/login.js";
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useRoute} from "vue-router";
import {computed, onMounted, onUnmounted, ref} from "vue";
import {clearToken} from "@/utils/token-store.js";
import {useSettingStore} from "@/store/setting.js";
import hanburger from '@/components/hamburger/index.vue'
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"
import {nextTick} from "vue";
import {enableNotify, disableNotify, notifyEnabled} from "@/utils/notify.js"

const {t, locale} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const emailStore = useEmailStore();
const notifyOn = ref(notifyEnabled());
const notifyBlocked = ref('Notification' in window && Notification.permission === 'denied')
const mobileSearchOpen = ref(false);
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const userinfoRef = ref({})
const aiAssistantRef = ref(null)
function openMobileSearch() {
  mobileSearchOpen.value = true
  nextTick(() => document.querySelector('.header-search-wrap.open input')?.focus())
}
function closeMobileSearch() {
  mobileSearchOpen.value = false
}
function mobileUserCommand(command) {
  if (command === 'settings') { router.push('/settings'); return }
  if (command === 'lang') { toggleLang(); return }
  if (command === 'logout' && !logoutLoading.value) {
    logoutLoading.value = true
    logout().catch(() => {})
    clearToken()
    router.replace('/login').finally(() => { logoutLoading.value = false })
  }
}
function toggleLang() {
  locale.value = locale.value === 'en' ? 'zh' : 'en'
  settingStore.lang = locale.value
  document.documentElement.lang = locale.value
}
function openAiFromMenu() {
  userInfoShow.value = false
  const email = emailStore.contentData?.email
  aiAssistantRef.value?.openPanel(Number(email?.emailId) || 0, String(email?.subject || ''))
}
function openAiForEmail(event) {
  aiAssistantRef.value?.openPanel(Number(event.detail?.emailId) || 0, String(event.detail?.subject || ''))
}
onMounted(() => {
  document.documentElement.lang = locale.value
  window.addEventListener('otsmail:ai', openAiForEmail)
  // Repair a lost/expired push subscription after a browser restart or SW update.
  if (notifyOn.value && 'Notification' in window && Notification.permission === 'granted') {
    enableNotify().then(result => { if (!result.ok) notifyOn.value = false })
  }
})
onUnmounted(() => {
  window.removeEventListener('otsmail:ai', openAiForEmail)
})
const showMailSearch = computed(() => ['email', 'star', 'unread', 'deleted', 'spam', 'all-email', 'send', 'draft', 'contacts', 'user'].includes(route.name))
const searchOptions = computed(() => {
  if (['contacts', 'user'].includes(route.name)) {
    return [
      {type: 'all', label: t('searchSummaryAll')},
      {type: 'name', label: t('contactName')},
      {type: 'email', label: t('contactEmail')},
    ]
  }
  return [
    {type: 'all', label: t('searchSummaryAll')},
    {type: 'subject', label: t('searchSummarySubject')},
    {type: 'content', label: t('searchSummaryContent')},
    {type: 'sender', label: t('searchSummarySender')},
    {type: 'senderAddress', label: t('searchSummarySenderAddress')},
    {type: 'recipientAddress', label: t('searchSummaryRecipientAddress')},
  ]
})

function refreshMailList() {
  if (['contacts', 'user', 'all-email'].includes(route.name)) {
    window.dispatchEvent(new CustomEvent('otsmail:search', {detail: {...emailStore.searchParams}}))
    return
  }
  emailStore.emailScroll?.refreshList()
}

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userStore.user.role.sendType === 'ban') {
    return t('sendBanned')
  }

  if (userStore.user.role.sendType === 'internal') {
    return t('sendInternal')
  }

  if (!userStore.user.role.sendCount) {
    return t('unlimited')
  }

  if (userStore.user.role.sendType === 'day') {
    return t('daily')
  }

  if (userStore.user.role.sendType === 'count') {
    return t('total')
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userStore.user.role.sendType === 'ban') {
    return null
  }

  if (userStore.user.role.sendType === 'internal') {
    return null
  }

  if (!userStore.user.role.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userStore.user.role.sendCount
})

function userInfoHide(e) {
    if (userInfoShow.value) {
        userinfoRef.value.handleClose()
    } else {
        userinfoRef.value.handleOpen()
    }
}

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function changeLang(lang) {
  setExtend(lang === 'en' ? 'en' : 'zh-cn')
  settingStore.lang = lang
}

async function toggleNotify() {
  if (notifyOn.value) {
    disableNotify()
    notifyOn.value = false
    ElMessage({message: t('notificationsOff'), type: 'info', plain: true})
    return
  }
  if ('Notification' in window && Notification.permission === 'denied') {
    notifyBlocked.value = true
    ElMessageBox.alert(t('notificationBlockedDetail'), t('notificationBlockedTitle'), {
      confirmButtonText: t('confirm'),
      type: 'warning'
    }).catch(() => {})
    return
  }
  const result = await enableNotify()
  notifyOn.value = result.ok
  if (result.ok) {
    ElMessage({message: t('notificationsOn'), type: 'success', plain: true})
    return
  }
  if (result.reason === 'push') {
    ElMessageBox.alert(
      `${t('notificationPushFailedDetail')}${result.error || 'unknown'}\n\n${t('notificationPushFailedHint')}`,
      t('notificationPushFailedTitle'),
      {confirmButtonText: t('confirm'), type: 'warning'}
    ).catch(() => {})
    return
  }
  notifyBlocked.value = result.permission === 'denied'
  ElMessage({
    message: result.reason === 'permission' ? t('notificationPermissionNeeded') : t('notificationsBlocked'),
    type: 'warning',
    plain: true
  })
}

function openDark(e) {

  const nextIsDark = !uiStore.dark
  const root = document.documentElement

  if (!document.startViewTransition) {
    switchDark(nextIsDark, root);
    return
  }

  const x = e.clientX
  const y = e.clientY

  const maxX = Math.max(x, window.innerWidth - x)
  const maxY = Math.max(y, window.innerHeight - y)
  const endRadius = Math.hypot(maxX, maxY)

  // 标记切换目标，供 CSS 选择器使用
  root.setAttribute('data-theme-to', nextIsDark ? 'dark' : 'light')
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

  const transition = document.startViewTransition(() => {
    switchDark(nextIsDark, root);
  })

  transition.finished.finally(() => {
    // 清理标记
    root.removeAttribute('data-theme-to')
  })
}

function switchDark(nextIsDark, root) {
  root.setAttribute('class', nextIsDark ? 'dark' : '')
  root.setAttribute('data-theme', nextIsDark ? 'dark' : 'light')
  const metaTag = document.getElementById('theme-color-meta');
  const isMobile =  !window.matchMedia("(pointer: fine) and (hover: hover)").matches;
  metaTag.setAttribute('content', nextIsDark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#FFFFFF' : '#F1F1F1'));
  uiStore.dark = nextIsDark
}

function openSend() {
  uiStore.writerRef.open()
}

function changeAside() {
  if (window.innerWidth > 1024) {
    uiStore.asideCollapsed = !uiStore.asideCollapsed
  } else {
    uiStore.asideShow = !uiStore.asideShow
  }
}

function clickLogout() {
  if (logoutLoading.value) return
  logoutLoading.value = true
  // 清掉内存里的 token 再跳转：只删 localStorage.token 的话守卫仍认为已登录，
  // 会把 /login 弹回来，表现就是要连点好几次才退得出去。
  logout().catch(() => {})
  clearToken()
  router.replace('/login').finally(() => {
    logoutLoading.value = false
  })
}

function formatName(email) {
  return email[0]?.toUpperCase() || ''
}

</script>
<style>
.detail-dropdown {
  color: var(--el-text-color-primary) !important;
}
</style>
<style lang="scss" scoped>

:deep(.el-popper.is-pure) {
  border-radius: 6px;
}

.user-details {
  width: 250px;
  font-size: 14px;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;

  .user-name {
    font-weight: bold;
    margin-top: 10px;
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }

  .detail-user-type {
    margin-top: 10px;
  }

  .action-info {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto;
    margin-top: 10px;

    > div:first-child {
      display: grid;
      align-items: center;
      gap: 10px;
    }

    > div:last-child {
      display: grid;
      gap: 10px;
      text-align: center;

      > div {
        display: flex;
        align-items: center;
      }
    }
  }

  .detail-email {
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
    color: var(--regular-text-color);
    cursor: pointer;
  }

  .logout {
    margin-top: 20px;
    width: 100%;
    padding-left: 10px;
    padding-right: 10px;
    padding-bottom: 10px;

    .el-button {
      border-radius: 6px;
      height: 28px;
      width: 100%;
    }
  }

  .details-avatar {
    margin-top: 20px;
    height: 40px;
    width: 40px;
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    overflow: hidden;
    border-radius: 50%;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    border: 1px solid var(--dark-border);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }
}


.header {
  text-align: left;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  gap: 12px;
}

.writer-box {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  color: #ffffff;
  background: var(--blue, #007aff);
  box-shadow: 0 2px 8px rgba(0, 122, 255, .2);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .16s var(--ease-ios, ease), box-shadow .16s var(--ease-ios, ease), background .16s ease;
}

.writer-box:hover {
  background: var(--blue, #007aff);
  box-shadow: 0 4px 12px rgba(0, 122, 255, .28);
  transform: translateY(-1px);
}

.writer-box:active {
  transform: scale(.96);
  box-shadow: none;
}

.writer-text {
  white-space: nowrap;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  min-width: 0;
  flex: 1;
}

.header-mail-search {
  flex: 1;
  max-width: 720px;
}

.header-ai {
  display: inline-flex;
  align-items: center;
}

.breadcrumb-item {
  font-weight: bold;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;

  .icon-item {
    align-self: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--label-2);
    transition: background .16s ease, color .16s ease;
  }

  .icon-item:hover {
    background: var(--fill-quaternary);
    color: var(--label);
  }

  .notice {
    font-size: 21px;
    margin-right: 2px;
  }

  .dark-icon {
    font-size: 19px;
  }

  .sun-icon {
    font-size: 22px;
  }

  @media (max-width: 767px) {
    gap: 2px;

    .writer-text {
      display: none;
    }

    .writer-box {
      width: 34px;
      padding: 0;
      justify-content: center;
    }

    .dark-icon, .sun-icon {
      display: none;
    }
  }

  .avatar {
    display: flex;
    align-items: center;
    cursor: pointer;

    .avatar-text {
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      height: 30px;
      width: 30px;
      overflow: hidden;
      border-radius: 50%;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 8px;
      border: 1px solid var(--dark-border);
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 10px;
      bottom: 10px;
    }
  }

}

.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}
</style>
