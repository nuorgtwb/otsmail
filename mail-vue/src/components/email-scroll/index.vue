<template>
  <div class="email-container">
    <div class="header-actions">
      <div class="mail-page-title"><b>{{ pageTitleEn }}</b><span>{{ pageTitle }}</span></div>
      <div class="header-left" :style="'padding-left:' + actionLeft">
        <div v-if="checkedEmailCount" class="selection-bar">
          <button type="button" class="selection-clear" :title="t('clearSelection')" @click="clearSelection">
            <Icon icon="mdi:close" width="16" height="16"/>
          </button>
          <span class="selection-count">{{ $t('selectedCount', {count: checkedEmailCount}) }}</span>
          <button v-if="props.emailRead && props.type !== 'draft'" type="button" class="selection-action" :title="t('markAsRead')" @click="handleRead">
            <Icon icon="fluent:mail-read-20-regular" width="16" height="16"/>
          </button>
          <button v-if="props.emailUnread && props.type !== 'draft'" type="button" class="selection-action" :title="t('markAsUnread')" @click="handleUnread">
            <Icon icon="fluent:mail-unread-20-regular" width="16" height="16"/>
          </button>
          <button v-if="props.type === 'email' || props.type === 'star'" type="button" class="selection-action" :title="t('markSpam')" @click="spamSelected">
            <Icon icon="mdi:email-remove-outline" width="16" height="16"/>
          </button>
          <button type="button" class="selection-action danger" :title="t('delete')" @click="handleDelete">
            <Icon icon="fluent:delete-20-regular" width="16" height="16"/>
          </button>
          <el-dropdown v-if="['email','star','all-email'].includes(props.type)" trigger="click" @command="moveSelectedTo">
            <button type="button" class="selection-action" :title="t('moveToCategory')">
              <Icon icon="mdi:folder-move-outline" width="16" height="16"/>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="item in moveCategories" :key="'bulk-move-'+item.key" :command="item.key">
                  <div class="right-dropdown-item"><Icon :icon="item.icon" width="18" height="18"/><span>{{ t(item.label) }}</span></div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="header-right">
        <button type="button" class="icon reload" :class="{ spinning: loading }" :title="t('refresh')" @click="refresh"><Icon icon="ion:reload" width="15" height="15"/></button>
        <div class="mail-pager" v-if="total > pageSize">
          <button type="button" class="pager-btn" :disabled="page <= 1" :title="t('prevPage')" @click="goPage(-1)">‹</button>
          <span class="pager-num">{{ page }} / {{ pageCount }}</span>
          <button type="button" class="pager-btn" :disabled="page >= pageCount" :title="t('nextPage')" @click="goPage(1)">›</button>
          <span class="pager-ellipsis">…</span>
        </div>
        <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
      </div>
    </div>

    <div v-if="showCategories" class="mail-categories" role="tablist">
      <button v-for="item in tabCategories" :key="item.key" type="button" role="tab"
              class="mail-category" :class="{active: activeCategory === item.key}"
              :aria-selected="activeCategory === item.key" @click="selectCategory(item.key)">
        <span class="tab-text">
          <span class="tab-en">{{ categoryTabEn[item.key] || item.key }}</span>
          <span class="tab-zh">{{ t(item.label) }}</span>
        </span>
        <span v-if="categoryCounts[item.key]" class="mail-category-count">{{ categoryCounts[item.key] }}</span>
      </button>
    </div>

    <div ref="scroll" class="scroll">
      <UseVirtualList ref="scrollbarRef"
                        @scroll="onScroll"
                        :list="list"
                        :options="{ itemHeight: itemHeight, overscan: 15 }"
                        class="virtual"
                        style="height: 100%"
                        v-if="!loading && emailList.length > 0"
                        :key="keyCount"
        >
          <template #default="{ data: item, index }" >
            <div :class="['email-row', props.type, { 'is-unread': item.unread === EmailUnreadEnum.UNREAD && showUnread, 'is-open': emailStore.contentData?.email?.emailId === item.emailId, 'is-checked': item.checked, 'ctx-open': dropdownShow && rightClickEmail.emailId === item.emailId }]"
                 :data-checked="item.checked"
                 @click="jumpDetails(item)"
                 v-if="!item.expand"
                 :key="item.emailId"
                 @contextmenu="handleContextmenu($event, item)"
            >
              <div @click.stop="starChange(item)" class="pc-star" v-if="showStar">
                <Icon v-if="item.isStar" icon="fluent-color:star-16" width="20" height="20"/>
                <Icon v-else icon="solar:star-line-duotone" width="18" height="18"/>
              </div>
              <div v-if="!showStar"></div>
              <div v-if="showAvatars" class="mail-avatar" aria-hidden="true"><span :style="avatarStyle(item)">{{ senderInitial(item.name) }}</span></div>
              <div class="title" :class="accountShow ? 'title-column' : 'title-column'">

                <div class="email-sender" :style="showStatus ? 'gap: 10px;' : ''">
                  <div class="email-status" v-if="showStatus">
                    <el-tooltip effect="dark" :content="item.statusIcon.content">
                      <Icon :icon="item.statusIcon.icon" :style="`color: ${item.statusIcon.color}`" width="20" height="20"/>
                    </el-tooltip>
                    <div class="del-status" v-if="item.isDel">
                      <el-tooltip effect="dark" :content="item.isDelContent">
                        <Icon class="icon" icon="mdi:email-remove" width="20" height="20"/>
                      </el-tooltip>
                    </div>
                  </div>
                  <div v-else></div>
                  <span class="name">
                    <span>
                      <div class="unread" v-if="isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <slot name="name" :email="item"><span v-html="highlightText(item.name || '')"></span></slot>
                    </span>
                    <div v-if="!isMobile" class="email-actions">
                      <button type="button" class="email-action" :title="t('delete')" @click.stop="rightDelete(item.emailId)">
                        <Icon icon="fluent:delete-20-regular" width="14" height="14"/>
                      </button>
                      <button type="button" class="email-action" :class="{disabled: item.unread !== EmailUnreadEnum.UNREAD}" :title="t('markAsRead')" @click.stop="markRead(item)">
                        <Icon icon="fluent:mail-read-20-regular" width="14" height="14"/>
                      </button>
                      <button type="button" class="email-action" :class="{disabled: item.unread === EmailUnreadEnum.UNREAD}" :title="t('markAsUnread')" @click.stop="markUnread(item)">
                        <Icon icon="fluent:mail-unread-20-regular" width="14" height="14"/>
                      </button>
                    </div>
                  </span>
                  <span class="phone-time">{{ item.formatCreateTime }}</span>
                </div>
                <div>
                  <div class="email-text">
                    <span class="email-subject">
                      <div class="unread" v-if="!isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <span v-if="item.code" class="code-tag" @click.stop="copyCode(item.code)">[{{ t('codeLabel') }}{{ item.code }}]</span>
                      <span class="subject-text">
                        <slot name="subject" :email="item" >
                          <span v-html="highlightText(item.subject || '\u200B')"></span>
                        </slot>
                      </span>
                      <span class="row-markers">
                        <Icon v-if="item.isStar" class="row-star" icon="fluent-color:star-16" width="14" height="14"/>
                        <span v-if="categoryLabel(item.spam ? 'spam' : item.category)" class="mail-category-tag" :class="'cat-' + (item.spam ? 'spam' : item.category)">{{ categoryLabel(item.spam ? 'spam' : item.category) }}</span>
                      </span>
                    </span>
                    <span class="email-content" v-html="highlightText(item.formatText || '\u200B')"></span>
                  </div>
                  <div class="user-info" v-if="showUserInfo">
                    <div class="account">
                      <span>
                        <Icon icon="mdi-light:email" width="20" height="20"/>
                      </span>
                      <span>{{ item.type === 0 ? item.toEmail : item.sendEmail }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="email-right" :style="showUserInfo ? 'align-self: start;':''">
                <span class="email-time" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread) ? 'font-weight: bold' : ''">{{ item.formatCreateTime }}</span>
              </div>
            </div>
            <skeletonBlock v-else-if="item.expand === 'loading'"
                           :rows="1"
                           :showStar="showStar"
                           :accountShow="accountShow"
                           :showStatus="showStatus"
                           :showUserInfo="showUserInfo"
                           :type="type"/>
            <div class="noLoading" v-else-if="item.expand === 'noMoreData'">
              <div>{{ $t('noMoreData') }}</div>
            </div>
          </template>
        </UseVirtualList>
      <skeletonBlock v-if="firstLoad && showFirstLoading"
                       :rows="20"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <skeletonBlock v-if="loading"
                       :rows="skeletonRows"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <div class="empty" v-if="noLoading && emailList.length === 0 && !loading">
        <el-empty :image-size="isMobile ? 120 : null" :description="$t('noMessagesFound')"/>
      </div>
    </div>
    <el-dropdown
        ref="dropdownRef"
        @visible-change="visibleChange"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{
      modifiers: [{ name: 'offset', options: { offset: [0, 0] } }],
    }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="startSelection(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon :icon="rightClickEmail.checked ? 'mdi:checkbox-multiple-blank-outline' : 'mdi:checkbox-multiple-marked-outline'" width="20" height="20" />
                <span>{{ rightClickEmail.checked ? t('cancelSelect') : t('select') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="rightClickEmail.code" @click="copyCode(rightClickEmail.code)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent-color:clipboard-24" width="20" height="20" />
                <span>{{t('copyCode')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star','all-email'].includes(props.type)" @click="toggleRead(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon :icon="rightClickEmail.unread === EmailUnreadEnum.UNREAD ? 'fluent:mail-read-20-regular' : 'fluent:mail-unread-20-regular'" width="20" height="20" />
                <span>{{ rightClickEmail.unread === EmailUnreadEnum.UNREAD ? t('markAsRead') : t('markAsUnread') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star','all-email'].includes(props.type)" @click="askAi(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="solar:magic-stick-3-bold-duotone" width="20" height="20" />
                <span>{{ t('askAiAboutEmail') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type)" @click="openReply(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="la:reply" width="20" height="20"  />
                <span>{{t('reply')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="openForward(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:arrow-up-right" width="19" height="19"  />
                <span>{{t('forward')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="starChange(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="solar:star-line-duotone" width="19" height="19"/>
                <span>{{t('star')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type)" @click="toggleSpam(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="mdi:email-remove-outline" width="20" height="20"/>
                <span>{{ rightClickEmail.spam ? t('unmarkSpam') : t('markSpam') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <template v-if="['email','star','all-email'].includes(props.type)">
            <el-dropdown-item disabled class="right-dropdown-label">
              <span>{{ t('moveToCategory') }}</span>
            </el-dropdown-item>
            <el-dropdown-item v-for="item in moveCategories" :key="'move-'+item.key"
                              :disabled="activeCategory === item.key"
                              @click="moveToCategory([rightClickEmail.emailId], item.key)">
              <template #default>
                <div class="right-dropdown-item">
                  <Icon :icon="item.icon" width="18" height="18"/>
                  <span>{{ t(item.label) }}</span>
                </div>
              </template>
            </el-dropdown-item>
          </template>
          <el-dropdown-item v-if="['email','star'].includes(props.type) && rightClickEmail.sendEmail" @click="addContact(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="mdi:account-plus-outline" width="20" height="20"/>
                <span>{{ t('contactAddQuick') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('user', rightClickEmail.userEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchUser')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('account', rightClickEmail.toEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchEmail')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('name', rightClickEmail.name)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchSender')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="rightDelete(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="uiw:delete" width="16" height="20" style="margin-left: 1px;margin-right: 3px" />
                <span>{{t('delete')}}</span>
              </div>
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import skeletonBlock from "@/components/email-scroll/skeleton/index.vue"
import {computed, onActivated, onUpdated, reactive, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import {useEmailStore} from "@/store/email.js";
import {emailSpam, emailSpamCancel, emailCounts, emailMoveCategory} from "@/request/email.js";
import {contactAdd} from "@/request/contact.js";
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {sleep} from "@/utils/time-utils.js"
import {fromNow} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {useRoute} from "vue-router";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll } from '@vueuse/core'

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  emailRead: Function,
  emailUnread: Function,
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: {
    type: String,
    default: '0'
  },
  timeSort: {
    type: Number,
    default: 0,
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showAccountIcon: {
    type: Boolean,
    default: true,
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  showStar: {
    type: Boolean,
    default: true
  },
  allowStar: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    default: 'email'
  },
  showFirstLoading: {
    type: Boolean,
    default: true
  },
  showUnread: {
    type: Boolean,
    default: false
  },
  showSearch: {
    type: Boolean,
    default: false
  },
  showCategories: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['jump', 'refresh-before', 'delete-draft', 'right-search', 'category-change'])
const {t} = useI18n()
const settingStore = useSettingStore()
const uiStore = useUiStore();
const showAvatars = computed(() => settingStore.showAvatars !== false && settingStore.settings.showAvatar !== 0 && settingStore.settings.showAvatar !== false)
const emailStore = useEmailStore();
const loading = ref(false);
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const expandList = reactive([])
const total = ref(0);
const pageSize = 50;
const page = ref(1);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
let reqLock = false
// Apple-ish wheel inertia: native wheel steps are too sharp for a mail list.
let inertiaEl = null
let inertiaRaf = 0
let inertiaVelocity = 0
let inertiaLast = 0
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function stopInertia() {
  if (inertiaRaf) cancelAnimationFrame(inertiaRaf)
  inertiaRaf = 0
  inertiaVelocity = 0
}

function inertiaStep(now) {
  if (!inertiaEl) return stopInertia()
  const dt = Math.min(2, Math.max(.5, (now - inertiaLast) / 16.667))
  inertiaLast = now
  const before = inertiaEl.scrollTop
  inertiaEl.scrollTop = before + inertiaVelocity * dt
  const moved = inertiaEl.scrollTop - before
  inertiaVelocity *= Math.pow(.9, dt)
  if (Math.abs(inertiaVelocity) < .5 || Math.abs(moved) < .5) return stopInertia()
  inertiaRaf = requestAnimationFrame(inertiaStep)
}

function onListWheel(e) {
  if (!inertiaEl || e.ctrlKey || e.shiftKey || e.deltaMode === 2) return
  const unit = e.deltaMode === 1 ? 16 : 1
  const delta = e.deltaY * unit
  // Trackpads already have OS inertia. Let the browser own them; custom rAF
  // scrollTop updates fight native scrolling and feel stepped.
  if (e.deltaMode === 0 && Math.abs(delta) < 30) {
    stopInertia()
    return
  }
  e.preventDefault()
  if (inertiaVelocity * delta < 0) inertiaVelocity = 0
  inertiaVelocity = Math.max(-180, Math.min(180, inertiaVelocity + delta * .16))
  if (!inertiaRaf) {
    inertiaLast = performance.now()
    inertiaRaf = requestAnimationFrame(inertiaStep)
  }
}

function unbindInertia() {
  if (inertiaEl) {
    inertiaEl.removeEventListener('wheel', onListWheel)
    inertiaEl.removeEventListener('pointerdown', stopInertia)
    inertiaEl.removeEventListener('touchstart', stopInertia)
  }
  inertiaEl = null
  stopInertia()
}

function bindInertia() {
  if (reduceMotion.matches) return
  const el = scroll.value?.querySelector('.virtual') || document.querySelector('.scroll .virtual')
  if (!el || el === inertiaEl) return
  unbindInertia()
  inertiaEl = el
  el.dataset.inertia = '1'
  el.addEventListener('wheel', onListWheel, {passive: false})
  el.addEventListener('pointerdown', stopInertia, {passive: true})
  el.addEventListener('touchstart', stopInertia, {passive: true})
}

let isMobile = ref(innerWidth < 1367)
let skeletonRows = 0
const timePaddingRight = ref('');
const keyCount = ref(0);
const dropdownRef = ref(null);
const dropdownCloseLock = ref(false);
const dropdownShow = ref(false);
const rightClickEmail = ref({});
const MAX_SELECT_COUNT = 95;
const checkedEmailCount = ref(0);
const isSelectMax = computed(() => checkedEmailCount.value >= MAX_SELECT_COUNT);
const route = useRoute()
const pageTitle = computed(() => {
  if (activeCategory.value && activeCategory.value !== 'all' && activeCategory.value !== 'primary') return categoryLabel(activeCategory.value)
  return t(route.meta?.title || 'inbox')
})
const titleEn = { email: 'Inbox', unread: 'Unread', spam: 'Spam', deleted: 'Trash', send: 'Sent', draft: 'Drafts', star: 'Starred', allMail: 'All mail', 'all-email': 'All mail' }
const categoryEn = { social: 'Social', promotion: 'Promotions', updates: 'Updates', ads: 'Ads', spam: 'Spam' }
const categoryTabEn = { all: 'All', primary: 'Primary', social: 'Social', promotion: 'Promotions', updates: 'Updates' }
const pageTitleEn = computed(() => activeCategory.value && !['all', 'primary'].includes(activeCategory.value)
  ? (categoryEn[activeCategory.value] || '')
  : (titleEn[route.name] || ''))
const activeCategory = ref(props.showCategories ? 'all' : '')
const categoryCounts = reactive({all: 0, primary: 0, social: 0, promotion: 0, updates: 0, ads: 0, spam: 0})
const categories = [
  {key: 'all', label: 'allMail', icon: 'mdi:email-multiple-outline'},
  {key: 'primary', label: 'categoryPrimary', icon: 'mdi:inbox-outline'},
  {key: 'social', label: 'categorySocial', icon: 'mdi:account-group-outline'},
  {key: 'promotion', label: 'categoryPromotion', icon: 'mdi:tag-outline'},
  {key: 'updates', label: 'categoryUpdates', icon: 'mdi:bell-outline'},
  {key: 'ads', label: 'categoryAds', icon: 'mdi:bullhorn-outline'},
  {key: 'spam', label: 'categorySpam', icon: 'mdi:alert-octagon-outline'}
]
const tabCategories = computed(() => categories.filter(item => !['ads', 'spam'].includes(item.key)))
const moveCategories = computed(() => categories.filter(item => !['all','ads','spam'].includes(item.key)))

function senderInitial(name) {
  const v = String(name || '?').trim()
  if (/^[\u3400-\u9fff]/.test(v)) return v.slice(0, 1)
  return v.split(/\s+/).map(x => x[0] || '').join('').slice(0, 2).toUpperCase() || '?'
}
function avatarStyle(item) {
  const seed = String(item.sendEmail || item.name || item.emailId || '')
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const hue = h % 360
  return { background: `linear-gradient(145deg, hsl(${hue} 72% 56%), hsl(${(hue + 38) % 360} 70% 42%))` }
}
function categoryLabel(category) {
  return t(categories.find(item => item.key === category)?.label || 'categoryPrimary')
}

function selectCategory(category) {
  if (activeCategory.value === category) return
  activeCategory.value = category
  page.value = 1
  refreshList()
  emit('category-change', category)
}

function loadCategoryCounts() {
  if (!props.showCategories) return Promise.resolve()
  return emailCounts(true).then(data => {
    Object.assign(categoryCounts, data.category)
    window.dispatchEvent(new CustomEvent('otsmail:counts'))
  }).catch(() => {})
}
let timer = null
const position = ref(
    DOMRect.fromRect({
      x: 0,
      y: 0,
    })
)

const triggerRef = ref({
  getBoundingClientRect() {
    return position.value;
  }
})

const queryParam = reactive({
  size: 50
});

const ESCAPE_MAP = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
function highlightText(value) {
  const text = String(value ?? '');
  const query = String(emailStore.searchParams?.text || '').trim();
  if (!query) return text.replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
  const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(/[&<>"']/g, ch => ESCAPE_MAP[ch])
      .replace(new RegExp(pattern, 'gi'), '<mark class="search-hit">$&</mark>');
}

defineExpose({
  refreshList,
  deleteEmail,
  addItem,
  handleList,
  emailList,
  firstLoad,
  latestEmail,
  noLoading,
  total,
  activeCategory,
  loadCategoryCounts
})

onActivated(() => {
  requestAnimationFrame(() => {
    const index = scrollTop / itemHeight.value
    scrollbarRef.value?.scrollTo(index);
  })
  nextTick(bindInertia)
})

onUpdated(bindInertia)

function onRealtimeEmail() {
  refreshList();
  loadCategoryCounts();
}

onMounted(() => {
  nextTick(bindInertia)
  timer = setInterval(() => {
    emailList.forEach(email => {
      email.formatCreateTime = fromNow(email.createTime);
    })
  }, 1000 * 60);
  window.addEventListener('otsmail:email', onRealtimeEmail);
})

onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('otsmail:email', onRealtimeEmail);
  unbindInertia()
})

getEmailList()
loadCategoryCounts()

window.onresize = () => {
  isMobile.value = innerWidth < 1367
}

function onScroll(e) {
  scrollTop = e.target.scrollTop;
}

const { arrivedState } = useScroll(scrollbarRef, {
  offset: { bottom: 1200 }
})


const list = computed(() => {
  return [...emailList, ...expandList]
})

const itemHeight = computed(() => {
    // all-email rows carry the account line, so they need one more line
    return props.type === 'all-email' ? 96 : 78
})

watch(() => emailList.length, () => {
  updateHasScrollbar();
  nextTick(bindInertia);
})

watch(scrollbarRef, () => {
  updateHasScrollbar();
})

// 瀵搫鍩楅崚閿嬫煀 (itemHeight 閺囧瓨鏁奸崥搴ゆ珓閹风喐绮撮崝銊ュ灙鐞涖劋绗夋导姘冲殰瀹歌鲸娲块弬?
watch(itemHeight, () => {
  keyCount.value ++
})

watch(followLoading, (isFollowLoading) => {
  if (isFollowLoading) {
    expandList.push({
      emailId: 0,
      expand: 'loading'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'loading')
    expandList.splice(index, 1);
  }
});

watch(noLoading, (isNoLoading) => {
  if (isNoLoading) {
    expandList.push({
      emailId: 0,
      expand: 'noMoreData'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'noMoreData')
    expandList.splice(index, 1);
  }
})


// 濮ｅ繘銆夐崶鍝勭暰 50 鐏忎緤绱濇惔鏇㈠劥娑撳秴鍟€鐟欙箑褰傞弮鐘绘閸旂姾娴?

watch(
    () => emailList.map(item => item.checked),
    () => {
      checkedEmailCount.value = emailList.length
      if (emailList.length > 0) {
        updateCheckStatus();
      }
    },
    {deep: true}
);


watch(() => emailStore.deleteIds, () => {
  if (emailStore.deleteIds) {
    deleteEmail(emailStore.deleteIds)
  }
})

watch(() => emailStore.cancelStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.cancelStarEmailId) {
      email.isStar = 0
    }
  })
})

watch(() => emailStore.addStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.addStarEmailId) {
      email.isStar = 1
    }
  })
})

window.addEventListener('wheel', (event) => {
  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
  }
})

function openReply(email) {
  uiStore.writerRef.openReply(email)
}

function openForward(email) {
  uiStore.writerRef.openForward(email)
}

function visibleChange(e) {
  dropdownShow.value = e;
  dropdownCloseLock.value = true;
  setTimeout(() => {
    dropdownCloseLock.value = false;
  },1500)

  if (!e && rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }
}

const handleContextmenu = (event, email) => {

  if (props.type === 'draft') {
    return
  }

  if (rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }

  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  event.preventDefault();
  dropdownRef.value?.handleOpen();

  rightClickEmail.value = email;
  rightClickEmail.value.rightChecked = true
}

function updateHasScrollbar() {
  nextTick(() => {
    const doc = document.querySelector('.virtual');
    if (doc) {
      if (doc.scrollHeight > doc.clientHeight) {
        timePaddingRight.value = '5px';
      } else {
        timePaddingRight.value = '15px'
      }
    }
  })
}

function getSkeletonRows() {
  if (emailList.length > 20) return skeletonRows = 20
  if (emailList.length === 0) return skeletonRows = 1
  skeletonRows = emailList.length
}

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

function htmlToText(email) {
  if (email.content) {

    const tempDiv = document.createElement('div');

    tempDiv.innerHTML = email.content.replace(
        /<(img|iframe|object|embed|video|audio|source|link)[^>]*>/gi, ''
    );

    const scriptsAndStyles = tempDiv.querySelectorAll('script, style, title');
    scriptsAndStyles.forEach(el => el.remove());
    let text = tempDiv.textContent || tempDiv.innerText || '';
    text = text.replace(/\s+/g, ' ').trim();
    return cleanSpace(text)
  }

  if (email.text) {
    return cleanSpace(email.text)
  } else {
    return ''
  }

}

function cleanSpace(text) {
  return text
      .replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')// 缁夊娅庨梿璺侯啍缁岀儤鐗?
      .replace(/\s+/g, ' ')                   // 婢舵氨鈹栭惂钘夋値楠炶埖鍨氭稉鈧稉顏嗏敄閺?
      .trim();
}

function starChange(email) {

  if (!email.isStar) {

    if (!props.allowStar) return;

    email.isStar = 1;
    props.starAdd(email.emailId).then(() => {
      email.isStar = 1;
      props.starSuccess(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 0
    })
  } else {

    email.isStar = 0;
    props.starCancel(email.emailId).then(() => {
      email.isStar = 0;
      props.cancelSuccess?.(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 1;
    })
  }
}

const handleRead = async () => {
  const emailIds = getSelectedMailsIds();
  try {
    await props.emailRead(emailIds);
    localRead(emailIds);
    await loadCategoryCounts();
  } catch (e) {
    await loadCategoryCounts();
  }
}

const handleUnread = async () => {
  const emailIds = getSelectedMailsIds();
  if (!emailIds.length || !props.emailUnread) return
  try {
    await props.emailUnread(emailIds);
    emailList.forEach(item => { if (emailIds.includes(item.emailId)) item.unread = EmailUnreadEnum.UNREAD })
    await loadCategoryCounts();
  } catch (e) {
    await loadCategoryCounts();
  }
}

function clearSelection() {
  emailList.forEach(item => { item.checked = false })
  checkedEmailCount.value = 0
}

function emailRead(emailId) {
  props.emailRead([emailId])
  localRead([emailId]);
}

async function setReadState(email, unread) {
  if (email.unread === unread) return
  const request = unread === EmailUnreadEnum.UNREAD ? props.emailUnread : props.emailRead
  if (!request) return
  try {
    await request([email.emailId])
    email.unread = unread
    email.checked = false
    await loadCategoryCounts()
  } catch (e) {
    // 婢惰精瑙﹂弮鏈典簰閺堝秴濮熺粩顖濐吀閺侀璐熼崙鍡礉闁灝鍘ょ憴鎺撶垼鐞氼偅婀伴崷棰佺鐟欏倹娲块弬鐗堝М妤?
    await loadCategoryCounts()
  }
}

function toggleRead(email) {
  return setReadState(email, email.unread === EmailUnreadEnum.UNREAD ? EmailUnreadEnum.READ : EmailUnreadEnum.UNREAD)
}

function markRead(email) {
  return setReadState(email, EmailUnreadEnum.READ)
}

function markUnread(email) {
  return setReadState(email, EmailUnreadEnum.UNREAD)
}

function localRead(emailIds) {
  emailIds.forEach(emailId => {
    const index = emailList.findIndex(email => email.emailId === emailId);
    if (index > -1) {
      if (emailList[index].unread === EmailUnreadEnum.UNREAD) {
        bumpCategory(emailList[index], -1)
      }
      emailList[index].unread = EmailUnreadEnum.READ;
      emailList[index].checked = false;
    }
  })
}

function bumpCategory(email, delta) {
  const key = email.spam ? 'spam' : email.category;
  if (key in categoryCounts) {
    categoryCounts[key] = Math.max(0, categoryCounts[key] + delta)
  }
}

function rightDelete(emailId) {

  if (props.type === 'all-email') {
    ElMessageBox.confirm(t('delOneEmailConfirm'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }).then(() => {
      props.emailDelete([emailId]).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true
        })
        emailStore.deleteIds = [emailId];
      })
    })
    return;
  }
  props.emailDelete([emailId]).then(() => {
    ElMessage({
      message: t('delSuccessMsg'),
      type: 'success',
      plain: true
    })
    emailStore.deleteIds = [emailId];
  })
}

function handleSearch(type, value) {
  emit('right-search', type, value);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    })
  }
}

function handleDelete() {
  ElMessageBox.confirm(t('delEmailsConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {

    if (props.type === 'draft') {
      const draftIds = getSelectedDraftsIds();
      emit('delete-draft', draftIds);
      return;
    }

    const emailIds = getSelectedMailsIds();
    props.emailDelete(emailIds).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = emailIds;
    })
  })
}

function deleteEmail(emailIds) {
  emailIds.forEach(emailId => {
    emailList.forEach((item, index) => {
      if (emailId === item.emailId) {
        emailList.splice(index, 1);
      }
    })
  })
  if (emailList.length < queryParam.size && !noLoading.value) {
    getEmailList()
  }
}

function addItem(email) {

  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)

  if (existIndex > -1) {
    return false;
  }

  email.formatText = htmlToText(email);
  email.formatCreateTime = fromNow(email.formatCreateTime);

  if (props.timeSort) {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }

    if (email.emailId > latestEmail.value?.emailId) {
      latestEmail.value = email
    }

    total.value++
    return true;
  }


  const index = emailList.findIndex(item => item.emailId < email.emailId)

  if (index !== -1) {
    handleList([email]);
    emailList.splice(index, 0, email);
  } else {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }
  }

  if (email.emailId > latestEmail.value?.emailId) {
    latestEmail.value = email
  }

  total.value++
  return true;
}

function handleCheckAllChange(val) {
  if (val) {
    let count = 0;
    emailList.forEach(item => {
      if (count < MAX_SELECT_COUNT) {
        item.checked = true;
        count++;
      } else {
        item.checked = false;
      }
    });
  } else {
    emailList.forEach(item => item.checked = false);
  }
  isIndeterminate.value = false;
}

// 閼惧嘲褰囬柅澶夎厬閻ㄥ嫰鍋栨禒璺哄灙鐞涒暐d
function getSelectedMailsIds() {
  return emailList.filter(item => item.checked).map(item => item.emailId);
}

function getSelectedDraftsIds() {
  return emailList.filter(item => item.checked).map(item => item.draftId);
}

function updateCheckStatus() {
  const checkedCount = emailList.filter(item => item.checked).length;
  checkedEmailCount.value = checkedCount;
  const atMax = checkedCount >= MAX_SELECT_COUNT;
  checkAll.value = emailList.length > 0 && (checkedCount === emailList.length || atMax);
  isIndeterminate.value = checkedCount > 0 && !checkAll.value;
}

function startSelection(email) {
  email.checked = !email.checked
  updateCheckStatus()
  dropdownRef.value?.handleClose()
}

function jumpDetails(email) {

  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
    return;
  }

  if (!dropdownCloseLock.value) {
    const sel = window.getSelection();
    if (sel.toString().trim()) {
      return
    }
  }
  if (checkedEmailCount.value > 0) {
    email.checked = !email.checked
    updateCheckStatus()
    return
  }
  clearSelection()
  emit('jump', email)
}


function getEmailList() {

  if (reqLock) return;

  reqLock = true
  loading.value = true
  firstLoad.value = true
  scrollTop = 0

  props.getEmailList(0, queryParam.size, activeCategory.value === 'all' ? undefined : activeCategory.value, page.value).then(async data => {
    firstLoad.value = false
    const list = (data.list || []).map(item => ({...item, checked: false}))

    latestEmail.value = data.latestEmail
    emailList.length = 0
    handleList(list)
    emailList.push(...list)
    loadCategoryCounts()

    total.value = Number(data.total) || 0
    if (page.value > pageCount.value) {
      page.value = pageCount.value
    }
    nextTick(() => scrollbarRef.value?.setScrollTop(0))
    noLoading.value = false
    followLoading.value = false
  }).finally(() => {
    loading.value = false
    reqLock = false
  })
}

function goPage(delta) {
  const next = page.value + delta
  if (next < 1 || next > pageCount.value) return
  page.value = next
  refreshList()
}

function handleList(list) {
  list.forEach(email => {
    email.formatText = htmlToText(email)
    email.formatCreateTime = fromNow(email.createTime);
    email.test = t('received')
    const statusIconMap = {
      0: { icon: 'ic:round-mark-email-read', color: '#51C76B', content: t('received') },
      1: { icon: 'bi:send-arrow-up-fill',  color: '#51C76B', content: t('sent') },
      2: { icon: 'bi:send-check-fill',     color: '#51C76B', content: t('delivered') },
      3: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      8: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      4: { icon: 'bi:send-exclamation-fill', color: '#FBBD08', content: t('complained') },
      5: { icon: 'bi:send-arrow-up-fill',  color: '#FBBD08', content: t('delayed') },
      7: { icon: 'ic:round-mark-email-read', color: '#FBBD08', content: t('noRecipient') },
    };

    if (email.isDel) {
      email.isDelContent = t('selectDeleted');
    }
    email.statusIcon = statusIconMap[email.status];
  })
}

async function handleSpam() {
  const ids = getSelectedMailsIds()
  if (ids.length === 0) return
  await Promise.all(ids.map(id => emailSpam(id)))
  ElMessage({message: t('markSpam'), type: 'success', plain: true})
  refresh()
}

async function toggleSpam(email) {
  if (!email?.emailId) return
  const target = email.spam ? 0 : 1
  await (target ? emailSpam : emailSpamCancel)(email.emailId)
  ElMessage({message: t(target ? 'markSpam' : 'unmarkSpam'), type: 'success', plain: true})
  refresh()
}

function askAi(email) {
  if (!email?.emailId) return
  window.dispatchEvent(new CustomEvent('otsmail:ai', {detail: {emailId: email.emailId, subject: email.subject}}))
}

async function moveToCategory(ids, category) {
  const list = (ids || []).map(Number).filter(Boolean)
  if (list.length === 0) return
  try {
    await emailMoveCategory(list, category)
    ElMessage({message: t('movedToCategory', {category: categoryLabel(category)}), type: 'success', plain: true})
    refresh()
    window.dispatchEvent(new CustomEvent('otsmail:counts'))
  } catch (e) {
    ElMessage({message: e?.message || t('operationFailed'), type: 'error', plain: true})
  }
}

function moveSelectedTo(category) {
  moveToCategory(getSelectedMailsIds(), category)
}

async function addContact(email) {
  if (!email?.sendEmail) return
  await contactAdd({
    name: email.name || '',
    email: email.sendEmail,
    groupName: 'Default',
    remark: ''
  })
  ElMessage({message: t('contactAddSuccess'), type: 'success', plain: true})
}

function refresh() {
  emit('refresh-before')
  if (props.skeleton) {
    scrollbarRef.value.setScrollTop(0)
  }
  refreshList()
}

function refreshList() {
  checkAll.value = false;
  isIndeterminate.value = false;
  getEmailList(true);
}

function loadData() {
  getEmailList()
}

</script>
<style lang="scss" scoped>

.email-container {
  display: flex;
  flex-direction: column;
  padding: 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  height: 100%;
}

.scroll {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  height: 100%;
  overflow: hidden;

  .virtual {
    will-change: scroll-position;
  }

  .empty {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }

  .noLoading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 15px 0 0 0;
    color: var(--secondary-text-color);
  }

  .follow-loading {
    height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--loadding-background);
    height: 100%;
    width: 100%;
    position: absolute;
    z-index: 1;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    pointer-events: none;
    transition: var(--loading-hide-transition);
    opacity: 0;
  }
}

:deep(.email-row) {
  display: flex;
  padding: 8px 0;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);
  cursor: pointer;
  align-items: center;
  position: relative;
  transition: background 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  height: 48px;
  @media (max-width: 1366px) {
    height: 83px;
  }

  @media (pointer: coarse) {
    /* 鐟欙箑鐫?*/
    user-select: none;
  }
  &.all-email {
    height: 65px;
    @media (max-width: 1366px) {
      height: 132px;
    }
  }
  .user-info {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    margin-top: 5px;
    margin-bottom: 2px;
    color: var(--email-scroll-content-color);
    @media (max-width: 1366px) {
      flex-direction: column;
    }

    .user, .account {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      transition: all 300ms;
      line-height: 12px;
      max-width: 300px;
      min-width: 0;

      @media (max-width: 1223px) {
        max-width: 280px;
      }

      span:first-child {
        position: relative;
      }

      span:last-child {
        margin-left: 5px;
        position: relative;
        bottom: 5px;
      }
    }
  }

  .checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
  }

  .all-email-checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
    @media (min-width: 1367px) {
      justify-content: start;
      height: 100%;
      align-self: start;
      padding-bottom: 30px;
    }
  }

  .title-column {
    @media (max-width: 1366px) {
      grid-template-columns: 1fr !important;
      gap: 4px !important;
    }
  }

  .title {
    flex: 1;
    display: grid;
    /* full-width list: keep the sender column tight so the subject stays close */
    grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
    column-gap: var(--space-4, 16px);
    @media (max-width: 1366px) {
      padding-right: 15px;
    }
    @media (max-width: 1366px) {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .email-sender {
      color: var(--el-text-color-primary);
      display: grid;
      grid-template-columns: auto 1fr auto;

      .email-status {
        display: flex;
        flex-direction: column;
        align-content: center;
        @media (max-width: 1366px) {
          flex-direction: row;
          gap: 5px;
        }
      }

      .name {
        display: grid;
        gap: 5px;
        grid-template-columns: auto 1fr;

        > span:last-child {
          display: flex;
          align-items: center;
        }

        @media (min-width: 1366px) {
          grid-template-columns: 1fr;
          > span:last-child {
            display: none;
          }
        }

        > span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .name-skeleton {
          width: 150px;
          height: 1rem;
          @media (max-width: 767px) {
            width: 130px;
          }
        }
      }

      .phone-time {
        font-weight: normal;
        font-size: 12px;
        @media (min-width: 1367px) {
          display: none;
        }
      }
    }

    .email-text-skeleton {
      .text-skeleton-one {
        width: 80%;
        height: 16px;
        @media (max-width: 1366px) {
          width: 40%;
        }
        @media (max-width: 767px) {
          width: 70%;
        }
      }

      .text-skeleton-two {
        width: min(300px, 100%);
        height: 16px;
        @media (min-width: 1367px) {
          display: none;
        }
        @media (max-width: 1366px) {
          width: 100%;
        }
      }
    }

    .email-text {
      display: grid;
      grid-template-columns: auto 1fr;
      @media (max-width: 1366px) {
        grid-template-columns: 1fr;
      }

      .email-subject {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        white-space: nowrap;
        min-width: 0;
        @media (min-width: 1367px) {
          padding-left: 5px;
        }
      }

      .code-tag {
        flex: 0 0 auto;
        max-width: 170px;
        height: 20px;
        line-height: 20px;
        font-size: 14px;
        color: var(--el-text-color-primary);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
      }

      .subject-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .email-content {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-left: 10px;
        color: var(--email-scroll-content-color);
        @media (max-width: 1366px) {
          padding-left: 0;
          margin-top: 0;
        }
      }
    }
  }


  .email-right {
    text-align: right;
    font-size: 12px;
    white-space: nowrap;
    display: flex;
    padding-left: 15px;
    align-items: center;
    @media (max-width: 1366px) {
      display: none;
    }
  }

  .email-right-skeleton {
    @media (max-width: 1366px) {
      display: none;
    }
  }

  &:hover {
    background-color: var(--email-hover-background);
    z-index: 0;
  }

  /*&[data-checked="true"] {
    background-color: #c2dbff;
  }*/
}


.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  width: 40px;
}

@media (max-width: 1366px) {
  .pc-star {
    display: none;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

.email-time {
  padding-right: v-bind(timePaddingRight);
}

:deep(.el-scrollbar__view) {
  height: 100%;
}

.header-actions {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 15px;
  padding: 3px 15px;
  box-shadow: var(--header-actions-border);

  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;
    column-gap: 20px;
    row-gap: 8px;
    padding-left: 2px;
    color: var(--el-text-color-primary);;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 100%;
    color: var(--el-text-color-primary);;

    .email-count {
      white-space: nowrap;
    }

    .mail-pager {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .pager-btn {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid var(--el-border-color);
      border-radius: 50%;
      background: var(--el-bg-color);
      color: var(--el-text-color-regular);
      cursor: pointer;
    }

    .pager-btn:disabled {
      opacity: .35;
      cursor: default;
    }

    .pager-num {
      min-width: 42px;
      text-align: center;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }

  .icon {
    font-size: 18px;
    cursor: pointer;
  }

  .more-icon {
    margin-top: 8px;
    margin-left: 15px;
  }
}

.del-status {
  color: var(--el-color-info);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  bottom: 1px;
}



.right-dropdown-item {
  display: flex;
  gap: 10px;
}

:deep(.el-dropdown-menu__item:last-child) {
  padding-bottom: 10px;
}

:deep(.el-dropdown-menu__item:first-child) {
  padding-top: 10px;
}

:deep(.el-dropdown-menu__item) {
  padding-right: 14px;
  padding-left: 14px;
}

.unread {
  height: 6px;
  width: 6px;
  min-width: 6px;
  flex: 0 0 6px;
  background: var(--el-color-primary);
  margin: 0;
  border-radius: 50%;
  display: inline-block;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* 闁喕娆㈤崚妤勩€冪憴鍡氼潕閿涙碍娲块崓蹇旀暪娴犲墎顔堥敍宀冣偓灞肩瑝閺勵垵銆冮弽?*/
:deep(.email-row) {
  height: 56px;
  padding: 0 16px 0 4px;
  gap: 2px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-shadow: none;

  &.is-unread {
    background: color-mix(in srgb, var(--el-color-primary) 4%, var(--el-bg-color));
  }

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: var(--el-color-primary-light-9);
  }

  &.is-unread .name,
  &.is-unread .email-subject {
    font-weight: 700 !important;
  }

  .checkbox {
    padding: 0 4px 0 8px;
  }

  .pc-star {
    width: 30px;
    justify-content: center;
  }

  .title {
    grid-template-columns: minmax(0, 132px) minmax(0, 1fr);
    column-gap: 14px;
    min-width: 0;
  }

  .email-sender .name {
    font-size: 13.5px;
    color: var(--el-text-color-primary);
  }

  .email-text .subject-text {
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .email-text :deep(mark.search-hit) {
    background: #fff1a8;
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }

  .email-text .email-content {
    padding-left: 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .email-right {
    padding-left: 12px;
    min-width: 86px;
    justify-content: flex-end;
  }

  .email-actions {
    display: none;
    align-items: center;
    gap: 2px;
    margin-right: 4px;
  }

  &:hover .email-actions {
    display: flex;
  }

  .email-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--el-text-color-secondary);
    cursor: pointer;

    &:hover {
      background: var(--fill-quaternary);
      color: var(--el-text-color-primary);
    }

    &.disabled {
      opacity: .3;
      pointer-events: none;
    }
  }

  .email-time {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    padding-right: 0;
  }

  @media (max-width: 1366px) {
    height: 72px;
    padding-right: 12px;

    .title {
      grid-template-columns: 1fr;
      gap: 3px;
    }

    .email-text .email-content {
      padding-left: 0;
    }
  }
}

.mail-categories {
  display: flex;
  align-items: stretch;
  flex: 0 0 auto;
  gap: 4px;
  height: 40px;
  padding: 0 12px;
  overflow-x: auto;
  border-bottom: 1px solid var(--separator);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.mail-category {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--label-2);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease;

  &:hover {
    color: var(--label);
  }

  &.active {
    color: var(--blue);
    border-bottom-color: var(--blue);
    font-weight: 600;
  }
}

.mail-category-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

.reload.spinning {
  animation: reload-spin .8s linear infinite;
}
@keyframes reload-spin {
  to { transform: rotate(360deg); }
}
/* v4 concept: vertical 3-line mail rows */
:deep(.email-row) {
  height: 78px !important;
  padding: 10px 14px !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  background: var(--rd-panel, var(--el-bg-color)) !important;
  border-bottom: 1px solid var(--rd-line, var(--el-border-color-lighter)) !important;
  box-shadow: none !important;
}
:deep(.email-row:hover) { background: var(--rd-panel-2, var(--fill-quaternary)) !important; }
:deep(.email-row > .checkbox),
:deep(.email-row > .pc-star) { display: none !important; }
:deep(.email-row > div:empty) { display: none !important; }
.selection-clear { display:inline-flex; align-items:center; justify-content:center; border:0; background:transparent; color:var(--label-2); cursor:pointer; padding:2px; border-radius:6px; }
.selection-clear:hover { background:var(--rd-panel-2, rgba(0,0,0,.05)); }
.mail-avatar {
  flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: grid !important; place-items: center;
  color: #fff; font-size: 12px; font-weight: 750; letter-spacing: .02em; margin-top: 2px;
}
:deep(.email-row .title) { display: block !important; flex: 1 1 auto; min-width: 0; width: auto !important; }
:deep(.email-row .email-sender) { display: flex !important; align-items: center; justify-content: space-between; gap: 8px; }
:deep(.email-row .email-sender .name) { font-size: 13px; line-height: 18px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.email-row .phone-time) { display: block !important; font-size: 11px; color: var(--rd-muted, var(--label-3)); font-weight: 500; flex: 0 0 auto; }
:deep(.email-row .email-text) { display: block !important; margin-top: 2px; }
:deep(.email-row .email-subject) { display: flex !important; align-items: center; gap: 5px; min-width: 0; width: 100%; flex: 1 1 auto; }
:deep(.email-row .email-subject .subject-text) { flex: 1 1 auto; min-width: 0; }
:deep(.email-row .row-markers) { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; margin-left: auto; }
:deep(.email-row .row-star) { flex: 0 0 auto; }
:deep(.email-row .email-subject .subject-text) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 18px; font-weight: 620; color: var(--rd-text, var(--label)); }
:deep(.email-row.is-unread .subject-text) { font-weight: 760; }
:deep(.email-row .email-content) { display: block !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; line-height: 17px; color: var(--rd-muted, var(--label-3)); margin-top: 1px; }
:deep(.email-row .email-right) { display: none !important; }
:deep(.email-row .mail-category-tag) { font-size: 9px; padding: 1px 5px; line-height: 14px; }
:deep(.email-row .email-status) { display: none !important; }
.email-row .unread { display:none !important; }
.email-container .header-right { display:flex; align-items:center; gap:10px; }
.email-container .header-right .reload { opacity:.65; }
.email-container .header-right .reload:hover { opacity:1; }
:deep(.email-sender) { position:relative; }
:deep(.email-sender .email-actions) { display:none; align-items:center; gap:1px; position:absolute; right:54px; top:7px; z-index:2; background:var(--rd-panel,transparent); border-radius:5px; }
:deep(.email-sender:hover .email-actions), :deep(.email-row:hover .email-actions) { display:flex; }
:deep(.email-row.ctx-open .email-actions) { display:none !important; }
:deep(.email-row.is-checked) { background: color-mix(in srgb, var(--rd-accent, #0a84ff) 7%, transparent) !important; }
.selection-bar { display:flex; align-items:center; gap:6px; min-width:0; }
.selection-clear, .selection-action { width:28px; height:28px; border:0; border-radius:8px; background:transparent; color:var(--rd-muted); display:grid; place-items:center; padding:0; cursor:pointer; }
.selection-clear:hover, .selection-action:hover { background:var(--rd-panel-2); color:var(--rd-text); }
.selection-action.danger:hover { background:rgba(239,68,68,.1); color:#dc2626; }
.selection-count { font-size:12px; font-weight:650; color:var(--rd-text); white-space:nowrap; }
:deep(.email-sender .email-action) { width:20px; height:20px; border:0; background:transparent; border-radius:5px; color:var(--rd-muted); display:grid; place-items:center; padding:0; }
:deep(.email-sender .email-action:hover) { background:var(--rd-panel-2); color:var(--rd-text); }
:deep(.email-sender .email-action.disabled) { opacity:.32; }
:deep(.mail-category-tag) { flex:0 0 auto; }
/* v12 category colors */
:deep(.mail-category-tag.cat-social){ color:#087f5b!important; background:rgba(16,185,129,.12)!important; }
:deep(.mail-category-tag.cat-promotion){ color:#b45309!important; background:rgba(245,158,11,.14)!important; }
:deep(.mail-category-tag.cat-updates){ color:#1d4ed8!important; background:rgba(59,130,246,.12)!important; }
:deep(.mail-category-tag.cat-ads){ color:#b91c1c!important; background:rgba(239,68,68,.12)!important; }
:deep(.mail-category-tag.cat-spam){ color:#9f1239!important; background:rgba(244,63,94,.12)!important; }

.pager-ico{width:6px;height:6px;border-top:1.6px solid currentColor;border-right:1.6px solid currentColor;display:inline-block;}
.pager-ico.left{transform:rotate(-135deg);margin-left:2px;}
.pager-ico.right{transform:rotate(45deg);margin-right:2px;}

</style>




