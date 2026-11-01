<template>
  <div class="box">
    <settingsTabs/>
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item wide">
        <div>{{$t('avatar')}}</div>
        <div class="row-flex">
          <el-avatar :size="44" :src="userStore.user.avatar || undefined" class="avatar-preview">{{ avatarLetter }}</el-avatar>
          <el-button type="primary" @click="openAvatar">{{$t('changeAvatar')}}</el-button>
        </div>
      </div>
      <div class="item">
        <div>{{$t('showSenderAvatar')}}</div>
        <el-switch :model-value="settingStore.showAvatars" @change="settingStore.setShowAvatars"/>
      </div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0;">
          <span v-if="setNameShow" style="display: flex; align-items: center; gap: 8px;">
            <el-input v-model="accountName" style="width: 120px;"></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else style="display: flex; align-items: center; gap: 8px; min-width: 0;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
      <div class="item wide">
        <div>{{$t('twoFactor')}}</div>
        <div class="row-flex">
          <span>{{ twoFactorEnabled ? $t('enabled') : $t('disabled') }}</span>
          <el-button type="primary" @click="openTwoFactor">{{ twoFactorEnabled ? $t('disable') : $t('enable') }}</el-button>
        </div>
      </div>
      <div class="item wide">
        <div>{{$t('twoFactorRequired')}}</div>
        <div class="row-flex">
          <el-switch :model-value="twoFactorRequired" :disabled="!twoFactorEnabled" @change="toggleTwoFactorRequired"/>
          <span class="row-desc">{{$t('twoFactorRequiredDesc')}}</span>
        </div>
      </div>
      <div class="item wide">
        <div>{{$t('signature')}}</div>
        <div class="signature-editor">
          <el-input v-model="signatureDraft" type="textarea" :rows="4" :maxlength="2000" show-word-limit :placeholder="$t('signaturePlaceholder')"/>
          <el-button type="primary" :loading="signatureSaving" @click="saveSignature">{{$t('save')}}</el-button>
        </div>
      </div>
      <div class="item wide">
        <div>{{$t('browserNotify')}}</div>
        <div class="row-flex">
          <el-switch :model-value="notifyOn" @change="toggleNotify"/>
          <span class="row-desc">{{$t('browserNotifyDesc')}}</span>
        </div>
      </div>
    </div>

    <div class="container">
      <div class="title">{{ $t('thirdPartyAccounts') }}</div>
      <div class="item oauth-item" v-if="settingStore.settings.githubSwitch">
        <div class="provider-label"><Icon icon="mingcute:github-line" width="18" height="18"/><span>GitHub</span></div>
        <div class="binding-actions">
          <template v-if="bindingFor('github')">
            <span class="bound-account">{{ $t('boundAs', {name: bindingLabel(bindingFor('github'))}) }}</span>
            <el-button link type="danger" @click="unbindProvider('github')">{{ $t('unbind') }}</el-button>
          </template>
          <el-button v-else type="primary" @click="bindGithub">{{ $t('bindProvider', {name:'GitHub'}) }}</el-button>
        </div>
      </div>
      <div class="item oauth-item" v-if="settingStore.settings.googleSwitch">
        <div class="provider-label"><Icon icon="flat-color-icons:google" width="18" height="18"/><span>Google</span></div>
        <div class="binding-actions">
          <template v-if="bindingFor('google')">
            <span class="bound-account">{{ $t('boundAs', {name: bindingLabel(bindingFor('google'))}) }}</span>
            <el-button link type="danger" @click="unbindProvider('google')">{{ $t('unbind') }}</el-button>
          </template>
          <el-button v-else type="primary" @click="bindGoogle">{{ $t('bindProvider', {name:'Google'}) }}</el-button>
        </div>
      </div>
      <div class="item oauth-item" v-if="settingStore.settings.linuxdoSwitch">
        <div class="provider-label"><Icon icon="simple-icons:linux" width="18" height="18"/><span>LinuxDo</span></div>
        <div class="binding-actions">
          <template v-if="bindingFor('linuxdo')">
            <span class="bound-account">{{ $t('boundAs', {name: bindingLabel(bindingFor('linuxdo'))}) }}</span>
            <el-button link type="danger" @click="unbindProvider('linuxdo')">{{ $t('unbind') }}</el-button>
          </template>
          <el-button v-else type="primary" @click="bindLinuxDo">{{ $t('bindProvider', {name:'LinuxDo'}) }}</el-button>
        </div>
      </div>
      <div class="item oauth-item" v-for="provider in enabledOidcProviders" :key="provider.id">
        <div class="provider-label">
          <img v-if="isImageIcon(provider.icon)" :src="normalizeIcon(provider.icon)" class="oidc-icon" alt=""/>
          <Icon v-else :icon="provider.icon || 'mingcute:shield-check-line'" width="18" height="18"/>
          <span>{{ provider.name || 'SSO' }}</span>
        </div>
        <div class="binding-actions">
          <template v-if="bindingFor(oidcProviderKey(provider))">
            <span class="bound-account">{{ $t('boundAs', {name: bindingLabel(bindingFor(oidcProviderKey(provider)))}) }}</span>
            <el-switch :model-value="bindingFor(oidcProviderKey(provider)).active !== 0"
                       @change="val => toggleBinding(oidcProviderKey(provider), val)"/>
            <el-button link type="danger" @click="unbindProvider(oidcProviderKey(provider))">{{ $t('unbind') }}</el-button>
          </template>
          <el-button v-else type="primary" @click="bindOidc(provider.id)">{{ $t('bindProvider', {name: provider.name || 'SSO'}) }}</el-button>
        </div>
      </div>
      <div class="item" v-if="!settingStore.settings.githubSwitch && !settingStore.settings.googleSwitch && !settingStore.settings.linuxdoSwitch && enabledOidcProviders.length === 0">
        <div><span>{{ $t('noThirdParty') }}</span></div>
      </div>
    </div>
    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <el-select
          :model-value="langSelect"
          class="language-select"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
      </el-select>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="avatarShow" :title="$t('changeAvatar')" width="360">
      <div class="form-col">
        <div class="avatar-center">
          <el-avatar :size="64" :src="avatarDraft || userStore.user.avatar || undefined" class="avatar-preview">{{ avatarLetter }}</el-avatar>
        </div>
        <el-input v-model="avatarDraft" :placeholder="$t('imageLink')" clearable/>
        <div class="row-flex row-start">
          <input ref="avatarFileRef" type="file" style="display: none"
                 accept="image/png,image/jpeg,image/webp,image/gif" @change="pickAvatarFile"/>
          <el-button @click="avatarFileRef.click()">{{$t('uploadImage')}}</el-button>
          <span class="row-desc">{{$t('avatarUploadTip')}}</span>
        </div>
        <div class="actions">
          <el-button @click="avatarShow = false">{{$t('cancel')}}</el-button>
          <el-button type="primary" :loading="avatarSaving" @click="saveAvatarLink">{{$t('save')}}</el-button>
        </div>
      </div>
    </el-dialog>
    <el-dialog v-model="twoFactorShow" :title="$t('twoFactor')" width="380">
      <div class="form-col">
        <template v-if="!twoFactorEnabled">
          <span class="row-desc">{{$t('twoFactorSetupDesc')}}</span>
          <div class="secret-box">
            <div class="secret-row">
              <span class="secret-label">{{$t('secretKeyLabel')}}</span>
              <span class="secret-value">{{ twoFactorSecret || '...' }}</span>
              <span class="edit-name" @click="copySecret">{{$t('copy')}}</span>
            </div>
            <div class="secret-url">{{ twoFactorUrl }}</div>
          </div>
          <el-input v-model="twoFactorCode" maxlength="6" :placeholder="$t('verifyCode')" @keyup.enter="confirmTwoFactor"/>
          <div class="actions">
            <el-button @click="twoFactorShow = false">{{$t('cancel')}}</el-button>
            <el-button type="primary" :loading="twoFactorLoading" @click="confirmTwoFactor">{{$t('enable')}}</el-button>
          </div>
        </template>
        <template v-else>
          <span class="row-desc">{{$t('twoFactorDisableDesc')}}</span>
          <el-input v-model="twoFactorCode" maxlength="6" :placeholder="$t('verifyCode')" @keyup.enter="disableTwoFactor"/>
          <div class="actions">
            <el-button @click="twoFactorShow = false">{{$t('cancel')}}</el-button>
            <el-button type="primary" :loading="twoFactorLoading" @click="disableTwoFactor">{{$t('disable')}}</el-button>
          </div>
        </template>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {computed, reactive, ref, onMounted, defineOptions} from 'vue'
import {Icon} from '@iconify/vue'
import {
  resetPassword,
  userDelete,
  setAvatar,
  uploadAvatar,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
  setTwoFactorRequired
} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import settingsTabs from "@/components/settings-tabs/index.vue";
import router from "@/router/index.js";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {clearToken} from "@/utils/token-store.js";
import {oidcConfig, oauthBindings, oauthUnbind, oauthSetBindingActive} from "@/request/ouath.js";
import {createPkce} from "@/utils/pkce.js";
import {notifyEnabled, enableNotify, disableNotify} from "@/utils/notify.js";
import {updateMySetting} from "@/request/my.js";

const { t } = useI18n()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const userStore = useUserStore();
const isAdmin = computed(() => userStore.user?.role?.permKeys?.includes('*') || userStore.user?.role?.name === 'admin');
const signatureDraft = ref(userStore.user?.signature || '')
const signatureSaving = ref(false)
async function saveSignature() {
  signatureSaving.value = true
  try {
    const result = await updateMySetting({signature: signatureDraft.value})
    userStore.user.signature = result.signature
    ElMessage({message: t('signatureSaved'), type: 'success', plain: true})
  } catch (e) {
    ElMessage({message: e?.message || t('saveFailed'), type: 'error', plain: true})
  } finally {
    signatureSaving.value = false
  }
}
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)
const enabledOidcProviders = computed(() => {
  const list = settingStore.settings.oidcProviders
  if (Array.isArray(list) && list.length > 0) return list
  return settingStore.settings.oidcSwitch
      ? [{id: '', name: settingStore.settings.oidcName || 'SSO'}]
      : []
})
const oauthBindingList = ref([])
const bindingMap = computed(() => Object.fromEntries(oauthBindingList.value.map(item => [item.provider, item])))

function oidcProviderKey(provider) {
  return provider.id === 'legacy' ? 'oidc' : 'oidc:' + provider.id
}
function bindingFor(provider) {
  return bindingMap.value[provider]
}
function bindingLabel(binding) {
  return binding?.name || binding?.username || t('boundAccount')
}
function normalizeIcon(icon) {
  return String(icon || '').replace(/\\\//g, '/').replace(/\\:/g, ':').trim()
}
function isImageIcon(icon) {
  return /^(https?:\/\/|data:image\/|\/\/|\/)/i.test(normalizeIcon(icon))
}
async function loadBindings() {
  try {
    oauthBindingList.value = await oauthBindings()
  } catch (e) {
    oauthBindingList.value = []
  }
}
async function toggleBinding(provider, active) {
  const current = bindingFor(provider)
  if (!current) return
  const old = current.active
  current.active = active ? 1 : 0
  try {
    await oauthSetBindingActive(provider, !!active)
    ElMessage({message: active ? t('bindingEnabled') : t('bindingDisabled'), type: 'success', plain: true})
  } catch (e) {
    current.active = old
    ElMessage({message: e?.message || t('bindingFailed'), type: 'error', plain: true})
  }
}
async function unbindProvider(provider) {
  try {
    await ElMessageBox.confirm(t('unbindConfirm'), t('unbindTitle'), {type: 'warning'})
    await oauthUnbind(provider)
    oauthBindingList.value = oauthBindingList.value.filter(item => item.provider !== provider)
    ElMessage({message: t('unbound'), type: 'success', plain: true})
  } catch (e) {
    if (e !== 'cancel') ElMessage({message: e?.message || t('unbindFailed'), type: 'error', plain: true})
  }
}
onMounted(loadBindings)

// 回调必须落在登录页，登录页才能拿 code；老配置里填站点根的要纠正
function oidcCallback(url) {
  const fallback = window.location.origin + '/login'
  if (!url) return fallback
  try {
    const parsed = new URL(url)
    if (parsed.pathname === '/' || parsed.pathname === '') return parsed.origin + '/login'
    return url
  } catch (e) {
    return fallback
  }
}

defineOptions({
  name: 'setting'
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

// v1.3 登录态绑定（大网站模式）：个人设置页把当前 GitHub/Google/LinuxDo 授权绑到当前账号
// 走 state=bind → 回调后 login 的 oauthGetUser 分支调 PUT /oauth/bind
function oauthNonce() {
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `oauth_nonce=${nonce}; Path=/; SameSite=Lax${secure}`
  return nonce
}

function bindGithub() {
  const clientId = settingStore.settings.githubClientId
  const redirectUri = encodeURIComponent(settingStore.settings.githubCallbackUrl)
  if (!clientId) {
    ElMessage({ message: t('providerNotConfigured', {name:'GitHub'}), type: 'warning', plain: true })
    return
  }
  window.location.href =
      `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user&state=bind-github:${oauthNonce()}`
}

function bindGoogle() {
  const clientId = settingStore.settings.googleClientId
  const redirectUri = encodeURIComponent(settingStore.settings.googleCallbackUrl)
  if (!clientId) {
    ElMessage({ message: t('providerNotConfigured', {name:'Google'}), type: 'warning', plain: true })
    return
  }
  window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile&state=bind-google:${oauthNonce()}`
}

function bindLinuxDo() {
  const clientId = settingStore.settings.linuxdoClientId
  const redirectUri = encodeURIComponent(settingStore.settings.linuxdoCallbackUrl)
  if (!clientId) {
    ElMessage({ message: t('providerNotConfigured', {name:'LinuxDo'}), type: 'warning', plain: true })
    return
  }
  window.location.href =
      `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=bind-linuxdo:${oauthNonce()}`
}

// 企业 SSO 绑定：授权端点与 client_id 由后端 discovery 提供，后台改配置不用动前端
async function bindOidc(providerId) {
  try {
    const config = await oidcConfig(providerId)
    const nonce = oauthNonce()
    const state = (providerId ? 'bind-oidc:' + providerId : 'bind-oidc') + ':' + nonce
    const {challenge} = await createPkce(state)
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: oidcCallback(config.callbackUrl),
      response_type: 'code',
      scope: config.scope || 'openid profile email',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })
    window.location.href = config.authorizationEndpoint + '?' + params.toString()
  } catch (e) {
    ElMessage({message: e?.message || t('oidcConfigFailed'), type: 'error', plain: true})
  }
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      clearToken();
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (setPwdLoading.value) return

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

// ---- 头像 ----

const avatarShow = ref(false)
const avatarDraft = ref('')
const avatarSaving = ref(false)
const avatarFileRef = ref(null)

const avatarLetter = computed(() =>
    (userStore.user.name || userStore.user.email || '?').charAt(0).toUpperCase())

function openAvatar() {
  avatarDraft.value = userStore.user.avatar || ''
  avatarShow.value = true
}

function saveAvatarLink() {
  if (avatarSaving.value) return
  const avatar = avatarDraft.value.trim()
  if (avatar && !/^https?:\/\//i.test(avatar)) {
    ElMessage({message: t('avatarLinkInvalid'), type: 'error', plain: true})
    return
  }
  avatarSaving.value = true
  setAvatar(avatar).then(() => {
    ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true})
    userStore.refreshUserInfo()
    avatarShow.value = false
  }).catch(() => {}).finally(() => {
    avatarSaving.value = false
  })
}

function pickAvatarFile(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    ElMessage({message: t('avatarTooLarge'), type: 'error', plain: true})
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    avatarSaving.value = true
    uploadAvatar(reader.result).then(() => {
      ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true})
      userStore.refreshUserInfo()
      avatarShow.value = false
    }).catch(() => {}).finally(() => {
      avatarSaving.value = false
    })
  }
  reader.readAsDataURL(file)
}

// ---- 两步验证 ----

const twoFactorEnabled = computed(() => userStore.user.twoFactor === true)
const twoFactorRequired = computed(() => userStore.user.twoFactorRequired === true)
const twoFactorShow = ref(false)
const twoFactorSecret = ref('')
const twoFactorUrl = ref('')
const twoFactorCode = ref('')
const twoFactorLoading = ref(false)

function openTwoFactor() {
  twoFactorCode.value = ''
  twoFactorSecret.value = ''
  twoFactorUrl.value = ''
  twoFactorShow.value = true
  if (twoFactorEnabled.value) return
  twoFactorSetup().then(res => {
    twoFactorSecret.value = res.secret
    twoFactorUrl.value = res.otpauthUrl
  }).catch(() => {
    twoFactorShow.value = false
  })
}

function checkCode() {
  if (!/^\d{6}$/.test(twoFactorCode.value)) {
    ElMessage({message: t('verifyCodeInvalid'), type: 'error', plain: true})
    return false
  }
  return true
}

function confirmTwoFactor() {
  if (!checkCode() || twoFactorLoading.value) return
  twoFactorLoading.value = true
  twoFactorEnable(twoFactorCode.value).then(() => {
    ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true})
    userStore.refreshUserInfo()
    twoFactorShow.value = false
  }).catch(() => {}).finally(() => {
    twoFactorLoading.value = false
  })
}

function disableTwoFactor() {
  if (!checkCode() || twoFactorLoading.value) return
  twoFactorLoading.value = true
  twoFactorDisable({code: twoFactorCode.value}).then(() => {
    ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true})
    userStore.refreshUserInfo()
    twoFactorShow.value = false
  }).catch(() => {}).finally(() => {
    twoFactorLoading.value = false
  })
}

async function toggleTwoFactorRequired(value) {
  try {
    await setTwoFactorRequired(value)
    await userStore.refreshUserInfo()
    ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true})
  } catch (e) {}
}

function copySecret() {
  if (!twoFactorSecret.value) return
  navigator.clipboard.writeText(twoFactorSecret.value).then(() => {
    ElMessage({message: t('copySuccessMsg'), type: 'success', plain: true})
  }).catch(() => {})
}

// ---- 浏览器通知 ----

const notifyOn = ref(notifyEnabled())

async function toggleNotify(value) {
  if (!value) {
    disableNotify()
    notifyOn.value = false
    return
  }
  const result = await enableNotify()
  notifyOn.value = result.ok
  if (!result.ok) {
    ElMessage({
      message: result.reason === 'push'
        ? `${t('notificationPushFailedTitle')}: ${result.error || 'unknown'}`
        : t('notifyDenied'),
      type: 'warning',
      plain: true
    })
  }
}

</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .admin-link { margin-left:12px; font-size:12px; font-weight:500; color:var(--rd-accent); text-decoration:none; }
.title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }

    /* 头像 / 两步验证 / 通知行：标签更长，收窄固定列 */
    .item.wide {
      grid-template-columns: 84px 1fr;
      gap: 106px;

      @media (max-width: 767px) {
        grid-template-columns: 84px 1fr;
        gap: 36px;
      }
    }

    .item.oauth-item {
      grid-template-columns: 160px minmax(0, 1fr);
      gap: 40px;
      align-items: center;

      @media (max-width: 767px) {
        grid-template-columns: 110px minmax(0, 1fr);
        gap: 12px;
      }
    }

    .provider-label,
    .binding-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .binding-actions {
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    .bound-account {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--label);
      font-weight: normal;
    }

    .oidc-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
      border-radius: 4px;
    }
  }

  .row-flex {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 10px;
  }

  .row-flex.row-start {
    justify-content: flex-start;
  }

  .row-desc {
    color: var(--label-2, #8e8e93);
    font-size: var(--text-footnote, 13px);
    line-height: 1.4;
    white-space: normal;
  }

  .avatar-preview {
    flex: none;
    background: var(--fill-quaternary, #f2f2f7);
  }

  .form-col {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .avatar-center {
    display: flex;
    justify-content: center;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .secret-box {
    padding: 12px;
    border-radius: var(--radius-md, 12px);
    background: var(--bg-grouped, #f2f2f7);

    .secret-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--text-subhead, 15px);
    }

    .secret-label {
      color: var(--label-2, #8e8e93);
      flex: none;
    }

    .secret-value {
      font-family: ui-monospace, Menlo, monospace;
      word-break: break-all;
    }

    .secret-row .edit-name {
      color: var(--blue, #007aff);
      cursor: pointer;
      flex: none;
    }

    .secret-url {
      margin-top: 8px;
      color: var(--label-3, #aeaeb2);
      font-size: var(--text-footnote, 13px);
      word-break: break-all;
    }
  }

  .language {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;

    .language-select {
      width: 100px;
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}
</style>
