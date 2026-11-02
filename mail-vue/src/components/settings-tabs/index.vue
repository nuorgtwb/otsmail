<template>
  <div class="settings-tabs" role="tablist">
    <button
        v-for="tab in tabs" :key="tab.path" type="button" role="tab"
        :aria-selected="route.path === tab.path"
        :class="{ active: route.path === tab.path }"
        @click="router.push(tab.path)">{{ tab.label }}</button>
  </div>
</template>
<script setup>
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useUserStore} from '@/store/user.js'
import {useI18n} from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const {t} = useI18n()
const tabs = computed(() => {
  const list = [{path: '/settings', label: t('settings')}]
  if (userStore.user?.type === 0 || userStore.user?.role?.permKeys?.includes('*')) {
    list.push({path: '/sys-setting', label: t('systemSettings')}, {path: '/mcp-admin', label: t('mcpService')})
  }
  list.push({path: '/user', label: t('accountPermissions')}, {path: '/role', label: t('role')}, {path: '/reg-key', label: t('regKey')}, {path: '/analysis', label: t('analysis')})
  return list
})
</script>
<style scoped>
.settings-tabs { display:flex; gap:6px; align-items:center; padding:14px 24px 0; border-bottom:1px solid var(--rd-line); background:var(--rd-bg); }
.settings-tabs button { border:0; background:transparent; color:var(--rd-muted); font-size:13px; font-weight:600; padding:8px 12px 10px; border-bottom:2px solid transparent; cursor:pointer; }
.settings-tabs button:hover { color:var(--rd-text); }
.settings-tabs button.active { color:var(--rd-text); border-bottom-color:var(--rd-accent); }
</style>
