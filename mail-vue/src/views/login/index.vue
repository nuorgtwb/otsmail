<template>
  <div id="login-box" data-build="v11" :style=" background ? 'background: var(--el-bg-color)' : ''" v-loading="oauthLoading" element-loading-text="登录中...">
    <div id="background-wrap" v-if="!settingStore.settings.background">
      <div class="x1 cloud"></div>
      <div class="x2 cloud"></div>
      <div class="x3 cloud"></div>
      <div class="x4 cloud"></div>
      <div class="x5 cloud"></div>
    </div>
    <div v-else class="login-bg" :style="background"></div>
    <div class="form-wrapper">
      <div class="container">
        <span class="form-title">{{ settingStore.settings.title || 'otsmail' }}</span>
        <span class="form-desc" v-if="show === 'login'">{{ $t('loginTitle') }}</span>
        <span class="form-desc" v-else>{{ $t('regTitle') }}</span>
        <div v-show="show === 'login'">
          <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="form.email"
                    type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="submit">
            <template #append v-if="!hideLoginDomain">
              <div class="domain-picker" :class="{ 'domain-picker-open': domainPickerOpen }" @click="domainPickerOpen = !domainPickerOpen" ref="domainPickerRef">
                <span class="domain-picker-label">{{ suffix || $t('select') }}</span>
                <Icon icon="mingcute:down-line" width="14" height="14" class="domain-picker-arrow" />
                <transition name="domain-picker-fade">
                  <div v-if="domainPickerOpen" class="domain-picker-dropdown">
                    <div
                      v-for="item in domainList"
                      :key="item"
                      class="domain-picker-option"
                      :class="{ active: suffix === item }"
                      @click.stop="suffix = item; domainPickerOpen = false"
                    >
                      {{ item }}
                      <Icon v-if="suffix === item" icon="mingcute:check-line" width="16" height="16" />
                    </div>
                  </div>
                </transition>
              </div>
            </template>
          </el-input>
          <el-input v-model="form.password" :placeholder="$t('password')" type="password" autocomplete="off" @keyup.enter="submit">
          </el-input>
          <template v-if="twoFactorShow">
            <el-input v-model="twoFactorCode" maxlength="6" inputmode="numeric"
                      :placeholder="$t('verifyCode')" autocomplete="one-time-code" @keyup.enter="submit"/>
            <div class="two-factor-hint">{{ $t('twoFactorLoginHint') }}</div>
          </template>
          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading"
          >{{ $t('loginBtn') }}
          </el-button>
          <el-button class="btn" v-if="settingStore.settings.linuxdoSwitch"  style="margin-top: 10px"  @click="linuxDoLogin">
            <el-avatar src="/image/linuxdo.webp" :size="18" style="margin-right: 10px" />LinuxDo
          </el-button>
          <el-button class="btn" v-if="settingStore.settings.githubSwitch" style="margin-top: 10px" @click="githubLogin">
            <Icon icon="mingcute:github-line" width="18" height="18" style="margin-right: 10px; color: var(--label)" />GitHub
          </el-button>
          <el-button class="btn" v-if="settingStore.settings.googleSwitch" style="margin-top: 10px" @click="googleLogin">
            <Icon icon="flat-color-icons:google" width="18" height="18" style="margin-right: 10px" />Google
          </el-button>
          <el-button class="btn" v-for="provider in oidcProviders" :key="provider.id" style="margin-top: 10px"
                     @click="oidcLogin(provider.id)">
            <img v-if="isImageIcon(provider.icon)" :src="normalizeIcon(provider.icon)" class="oidc-provider-icon" alt=""/>
            <Icon v-else :icon="provider.icon || 'mingcute:shield-check-line'" width="18" height="18" style="margin-right: 10px; color: var(--label)" />{{ provider.name || 'SSO' }}
          </el-button>
        </div>
        <div v-show="show !== 'login'">
          <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="registerForm.email" type="text" :placeholder="$t('emailAccount')"
                    autocomplete="off" @keyup.enter="submitRegister">
            <template #append v-if="!hideLoginDomain">
              <div class="domain-picker" :class="{ 'domain-picker-open': domainPickerOpen }" @click="domainPickerOpen = !domainPickerOpen" ref="domainPickerRef">
                <span class="domain-picker-label">{{ suffix || $t('select') }}</span>
                <Icon icon="mingcute:down-line" width="14" height="14" class="domain-picker-arrow" />
                <transition name="domain-picker-fade">
                  <div v-if="domainPickerOpen" class="domain-picker-dropdown">
                    <div
                      v-for="item in domainList"
                      :key="item"
                      class="domain-picker-option"
                      :class="{ active: suffix === item }"
                      @click.stop="suffix = item; domainPickerOpen = false"
                    >
                      {{ item }}
                      <Icon v-if="suffix === item" icon="mingcute:check-line" width="16" height="16" />
                    </div>
                  </div>
                </transition>
              </div>
            </template>
          </el-input>
          <el-input v-model="registerForm.password" :placeholder="$t('password')" type="password" autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-model="registerForm.confirmPassword" :placeholder="$t('confirmPwd')" type="password"
                    autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-if="settingStore.settings.regKey === 0" v-model="registerForm.code" :placeholder="$t('regKey')"
                    type="text" autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-if="settingStore.settings.regKey === 2" v-model="registerForm.code"
                    :placeholder="$t('regKeyOptional')" type="text" autocomplete="off" @keyup.enter="submitRegister"/>
          <div v-show="verifyShow"
               class="register-turnstile"
               :data-sitekey="settingStore.settings.siteKey"
               data-callback="onTurnstileSuccess"
               data-error-callback="onTurnstileError"
               data-after-interactive-callback="loadAfter"
               data-before-interactive-callback="loadBefore"
          >
            <span style="font-size: 12px;color: #F56C6C" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
          </div>
          <el-button class="btn" style="margin: 0" type="primary" @click="submitRegister" :loading="registerLoading"
          >{{ $t('regBtn') }}
          </el-button>
          <el-button v-if="settingStore.settings.linuxdoSwitch" class="btn" style="margin-top: 10px"  @click="linuxDoLogin">
            <el-avatar src="/image/linuxdo.webp" :size="18" style="margin-right: 10px" />LinuxDo
          </el-button>
          <el-button v-if="settingStore.settings.githubSwitch" class="btn" style="margin-top: 10px" @click="githubLogin">
            <Icon icon="mingcute:github-line" width="18" height="18" style="margin-right: 10px; color: var(--label)" />GitHub
          </el-button>
          <el-button v-if="settingStore.settings.googleSwitch" class="btn" style="margin-top: 10px" @click="googleLogin">
            <Icon icon="flat-color-icons:google" width="18" height="18" style="margin-right: 10px" />Google
          </el-button>
        </div>
        <template v-if="settingStore.settings.register === 0">
          <div class="switch" @click="show = 'register'" v-if="show === 'login'">{{ $t('noAccount') }}
            <span>{{ $t('regSwitch') }}</span></div>
          <div class="switch" @click="show = 'login'" v-else>{{ $t('hasAccount') }} <span>{{ $t('loginSwitch') }}</span>
          </div>
        </template>
      </div>
    </div>
    <el-dialog class="bind-dialog" v-model="showBindForm"  title="注册邮箱" >
      <div class="bind-container">
        <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="bindForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="bind">
          <template #append v-if="!hideLoginDomain">
              <div class="domain-picker" @click="domainPickerOpen = !domainPickerOpen">
                <span class="domain-picker-label">{{ suffix || $t('select') }}</span>
                <Icon icon="mingcute:down-line" width="14" height="14" class="domain-picker-arrow" />
                <div v-if="domainPickerOpen" class="domain-picker-dropdown">
                  <div
                    v-for="item in domainList"
                    :key="item"
                    class="domain-picker-option"
                    :class="{ active: suffix === item }"
                    @click.stop="suffix = item; domainPickerOpen = false"
                  >
                    {{ item }}
                    <Icon v-if="suffix === item" icon="mingcute:check-line" width="16" height="16" />
                  </div>
                </div>
              </div>
            </template>
        </el-input>
        <el-input v-if="settingStore.settings.regKey === 0" v-model="bindForm.code" :placeholder="$t('regKey')"
                  type="text" autocomplete="off" @keyup.enter="bind"/>
        <el-input v-if="settingStore.settings.regKey === 2" v-model="bindForm.code"
                  :placeholder="$t('regKeyOptional')" type="text" autocomplete="off" @keyup.enter="bind"/>
        <el-button class="btn" type="primary" @click="bind" :loading="bindLoading"
        >绑定
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import router from "@/router";
import {computed, nextTick, onBeforeUnmount, onMounted, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {register} from "@/request/login.js";
import {websiteConfig} from "@/request/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {useUiStore} from "@/store/ui.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import {useI18n} from "vue-i18n";
import {
  oauthBindUser,
  oauthLinuxDoLogin,
  oauthGithubLogin,
  oauthGoogleLogin,
  oauthBind,
  oauthOidcLogin,
  oidcConfig
} from "@/request/ouath.js";
import {setToken} from "@/utils/token-store.js";
import {createPkce, takePkce} from "@/utils/pkce.js";

const {t} = useI18n();
const accountStore = useAccountStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const settingStore = useSettingStore();
const loginLoading = ref(false)
const twoFactorShow = ref(false)
const twoFactorCode = ref('')
const bindLoading = ref(false)
const oauthLoading = ref(false);
const oidcProviders = computed(() => {
  const list = settingStore.settings.oidcProviders
  if (Array.isArray(list) && list.length > 0) return list
  // 兼容老后端：只有单条 oidc_* 配置
  return settingStore.settings.oidcSwitch
      ? [{id: '', name: settingStore.settings.oidcName || 'SSO'}]
      : []
})
function normalizeIcon(icon) {
  return String(icon || '').replace(/\\\//g, '/').replace(/\\:/g, ':').trim()
}
function isImageIcon(icon) {
  return /^(https?:\/\/|data:image\/|\/\/|\/)/i.test(normalizeIcon(icon))
}
const showBindForm = ref(false);
const show = ref('login')

const bindForm = reactive({
  email: '',
  oauthUserId: '',
  provider: '',
  code: '',
  bindToken: '',
  nonce: ''
})

const form = reactive({
  email: '',
  password: '',

});
const suffix = ref('')
const domainPickerOpen = ref(false)
const domainPickerRef = ref(null)

const handleClickOutside = (e) => {
  if (domainPickerRef.value && !domainPickerRef.value.contains(e.target)) {
    domainPickerOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

const registerForm = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  code: null
})
const domainList = settingStore.domainList;
const registerLoading = ref(false)
suffix.value = domainList[0]
const verifyShow = ref(false)
let verifyToken = ''
let turnstileId = null
let botJsError = ref(false)
let verifyErrorCount = 0

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  console.warn('人机验加载失败', e)
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.register-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.loadAfter = (e) => {
  console.log('loadAfter')
}

window.loadBefore = (e) => {
  console.log('loadBefore')
}

const loginOpacity = computed(() => {
  const opacity = settingStore.settings.loginOpacity
  return uiStore.dark ? `rgba(0, 0, 0, ${opacity})` : `rgba(255, 255, 255, ${opacity})`
})

const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)

const background = computed(() => {

  return settingStore.settings.background ? {
    'background-image': `url(${cvtR2Url(settingStore.settings.background)})`,
    'background-repeat': 'no-repeat',
    'background-size': 'cover',
    'background-position': 'center'
  } : ''
})

const getFullEmail = (email) => {
  return hideLoginDomain.value ? email : email + suffix.value
}

const getEmailName = (email) => {
  return email.split('@')[0]
}

function oauthNonce() {
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `oauth_nonce=${nonce}; Path=/; SameSite=Lax${secure}`
  return nonce
}

function linuxDoLogin() {
  const clientId = settingStore.settings.linuxdoClientId
  const redirectUri = encodeURIComponent(settingStore.settings.linuxdoCallbackUrl)
  window.location.href =
      `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=linuxdo:${oauthNonce()}`
}

function githubLogin() {
  const clientId = settingStore.settings.githubClientId
  const redirectUri = encodeURIComponent(settingStore.settings.githubCallbackUrl)
  window.location.href =
      `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user&state=github:${oauthNonce()}`
}

function googleLogin() {
  const clientId = settingStore.settings.googleClientId
  const redirectUri = encodeURIComponent(settingStore.settings.googleCallbackUrl)
  window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile&state=google:${oauthNonce()}`
}

async function oidcLogin(providerId) {
  // 授权端点由后端 discovery 取，后台改配置不用动前端
  try {
    const config = await oidcConfig(providerId)
    const nonce = oauthNonce()
    const state = (providerId ? 'oidc:' + providerId : 'oidc') + ':' + nonce
    const {challenge} = await createPkce(state)
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      response_type: 'code',
      scope: config.scope || 'openid profile email',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })
    window.location.href = config.authorizationEndpoint + '?' + params.toString()
  } catch (e) {
    ElMessage({message: e?.message || 'OIDC 配置读取失败', type: 'error', plain: true})
  }
}

oauthGetUser();

async function oauthGetUser() {

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('error_description') || params.get('error')

  if (!code && oauthError) {
    ElMessage({message: oauthError, type: 'error', plain: true, duration: 6000})
  }

  if (code) {
    const codeVerifier = takePkce(state || '')

    const providerMap = { github: oauthGithubLogin, google: oauthGoogleLogin, linuxdo: oauthLinuxDoLogin, oidc: oauthOidcLogin }
    // state 形如 github / oidc:<id>（登录）或 bind-github / bind-oidc:<id>（个人设置里绑定）
    const isBindState = (state || '').startsWith('bind')
    const rawProvider = isBindState ? state.replace(/^bind-/, '') : (state || '')
    const [provider, ...providerIdParts] = rawProvider.split(':')
    const nonce = providerIdParts.pop() || ''
    const providerId = providerIdParts.join(':')
    const loginFn = providerMap[provider] || oauthLinuxDoLogin
    // OIDC 需要 provider/codeVerifier；GitHub/Google/LinuxDo 只取 code/state/nonce。
    const runLogin = () => provider === 'oidc'
      ? loginFn(code, state, providerId, codeVerifier, nonce)
      : loginFn(code, state, nonce)

    oauthLoading.value = true

    // v1.3 登录态绑定（大网站模式）：state=bind 时已登录用户把 OAuth 授权绑到当前账号
    if (isBindState) {
      runLogin().then(data => {
        // 授权落库但未绑定 → 绑到当前登录账号；这里绝不能用返回的 token 换会话（那是别人的账号）
        oauthBind({ oauthUserId: data.userInfo.oauthUserId, provider: data.userInfo.provider, bindToken: data.bindToken, nonce }).then(() => {
          ElMessage({ message: '绑定成功', type: 'success', plain: true })
          router.replace('/settings')
        }).catch(() => {
          router.replace('/settings')
        }).finally(() => {
          oauthLoading.value = false
        })
      }).catch(() => {
        oauthLoading.value = false
        router.replace('/settings')
      })
      return
    }

    runLogin().then(data => {

      bindForm.oauthUserId = data.userInfo.oauthUserId;
      bindForm.provider = data.userInfo.provider;
      bindForm.bindToken = data.bindToken || '';
      bindForm.nonce = nonce;

      if (!data.token) {
        showBindForm.value = true
        oauthLoading.value = false
        ElMessage({
          message: '请注册绑定一个邮箱',
          type: 'warning',
          duration: 4000,
          plain: true,
        })
        return;
      }

      saveToken(data.token);
    }).catch(() => {
      oauthLoading.value = false
    })
  }

  const cleanUrl = window.location.origin + window.location.pathname
  window.history.replaceState({}, '', cleanUrl)
}

function bind() {

  if (bindLoading.value) return

  if (!bindForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }


  if (getEmailName(bindForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(bindForm.email);


  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!bindForm.code) {

      ElMessage({
        message: t('emptyRegKeyMsg'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  const form = {email, oauthUserId: bindForm.oauthUserId, provider: bindForm.provider, code: bindForm.code, bindToken: bindForm.bindToken, nonce: bindForm.nonce}

  bindLoading.value = true
  oauthBindUser(form).then(data => {
    saveToken(data.token)
  }).catch(() => {
    bindLoading.value = false
  })
}

const submit = () => {

  if (loginLoading.value) return

  if (!form.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(form.email);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  loginLoading.value = true
  login(email, form.password, twoFactorCode.value).then(async data => {
    await saveToken(data.token)
  }).catch(e => {
    if (e?.code === 428) {
      twoFactorShow.value = true
      twoFactorCode.value = ''
      ElMessage({
        message: e.message || t('twoFactorLoginHint'),
        type: 'warning',
        plain: true
      })
    }
  }).finally(() => {
    loginLoading.value = false
  })
}

async function saveToken(token) {
  setToken(token)
  refreshWebsiteConfig()
  const user = await loginUserInfo();
  accountStore.currentAccountId = user.account.accountId;
  accountStore.currentAccount = user.account;
  userStore.user = user;
  const routers = permsToRouter(user.permKeys);
  routers.forEach(routerData => {
    router.addRoute('layout', routerData);
  });
  await router.replace({name: 'layout'})
  uiStore.showNotice()
  oauthLoading.value = false;
  bindLoading.value = false;
}

function refreshWebsiteConfig() {
  websiteConfig().then(setting => {
    settingStore.settings = setting
    settingStore.domainList = setting.domainList
    if (!suffix.value && setting.domainList.length > 0) {
      suffix.value = setting.domainList[0]
    }
    document.title = setting.title
  }).catch(e => {
    console.error(e)
  })
}


function submitRegister() {

  if (registerLoading.value) return

  if (!registerForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  console.log(registerForm.email)

  if (getEmailName(registerForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  const email = getFullEmail(registerForm.email);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!registerForm.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {

    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!registerForm.code) {

      ElMessage({
        message: t('emptyRegKeyMsg'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  if (!verifyToken && (settingStore.settings.registerVerify === 0 || (settingStore.settings.registerVerify === 2 && settingStore.settings.regVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.register-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
          }
        } else {
          window.turnstile.reset('.register-turnstile')
        }
      })
    } else if (!botJsError.value) {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  registerLoading.value = true

  const form = {
    email,
    password: registerForm.password,
    token: verifyToken,
    code: registerForm.code
  }

  register(form).then(({regVerifyOpen}) => {
    show.value = 'login'
    registerForm.email = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    registerForm.code = ''
    registerLoading.value = false
    verifyToken = ''
    settingStore.settings.regVerifyOpen = regVerifyOpen
    verifyShow.value = false
    ElMessage({
      message: t('regSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).catch(res => {

    registerLoading.value = false

    if (res.code === 400) {
      verifyToken = ''
      settingStore.settings.regVerifyOpen = true
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.register-turnstile')
        })
      }
      verifyShow.value = true

    }
  });
}

</script>


<style>
.el-select-dropdown__item {
  padding: 0 15px;
}

.no-autofill-pwd {
  .el-input__inner {
    -webkit-text-security: disc !important;
  }
}
</style>

<style lang="scss" scoped>

.form-wrapper {
  position: fixed;
  right: 0;
  height: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  @media (max-width: 767px) {
    width: 100%;
  }
}

.container {
  background: v-bind(loginOpacity);
  padding-left: 40px;
  padding-right: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 450px;
  height: 100%;
  border-left: 1px solid var(--login-border);
  box-shadow: var(--el-box-shadow-light);
  @media (max-width: 1024px) {
    padding: 20px 18px;
    width: 384px;
    margin-left: 18px;
  }
  @media (max-width: 767px) {
    border: 1px solid var(--login-border);
    padding: 20px 18px;
    border-radius: 6px;
    height: fit-content;
    width: 100%;
    margin-right: 18px;
    margin-left: 18px;
  }

  .btn {
    height: 36px;
    width: 100%;
    border-radius: 6px;
  }

  .oidc-provider-icon {
    width: 18px;
    height: 18px;
    margin-right: 10px;
    object-fit: contain;
    border-radius: 4px;
    vertical-align: middle;
  }

  .form-desc {
    margin-top: 5px;
    margin-bottom: 18px;
    color: var(--form-desc-color);
  }

  .two-factor-hint {
    margin: -8px 0 12px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--label-3, var(--form-desc-color));
  }

  .form-title {
    font-weight: bold;
    font-size: 22px !important;
  }

  .switch {
    margin-top: 20px;
    text-align: center;

    span {
      color: var(--login-switch-color);
      cursor: pointer;
    }
  }

  :deep(.el-input__wrapper) {
    border-radius: 6px;
    background: var(--el-bg-color);
  }

  .email-input :deep(.el-input__wrapper) {
    border-radius: 10px 0 0 10px;
    background: var(--fill-tertiary);
    border: none !important;
    box-shadow: none !important;
  }

  .el-input {
    height: 38px;
    width: 100%;
    margin-bottom: 18px;

    :deep(.el-input__inner) {
      height: 36px;
    }
  }
}

:deep(.el-select-dropdown__item) {
  padding: 0 10px;
}

:deep(.bind-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.bind-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  background: var(--fill-tertiary);
  border: none !important;
  border-radius: 0 10px 10px 0;
}

:deep(.el-button+.el-button) {
  margin: 0;
}

.register-turnstile {
  margin-bottom: 18px;
}

.custom-style {
  margin-bottom: 10px;
}

.custom-style .el-segmented {
  --el-border-radius-base: 6px;
  width: 180px;
}


.form-wrapper { right: 5%; width: 400px; }
.form-wrapper .container { width: min(420px, 100%); height: auto; padding: 36px; border-radius: 24px; background: rgba(255,255,255,.94) !important; box-shadow: 0 24px 70px rgba(15,23,42,.14), 0 2px 8px rgba(15,23,42,.06); }
.form-wrapper .form-title { font-size: 30px !important; letter-spacing: -.8px; }
@media (max-width: 900px) {
  .form-wrapper { right: 0; width: 100%; }
  .form-wrapper .container { width: min(420px, calc(100vw - 32px)); padding: 28px 24px; }
}
#login-box {
  background: #f4f6fb;
  font: 100% Arial, sans-serif;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr;
}


/* 自定义背景图与云层都要铺满整屏：flex 布局下子元素不会自动撑开 */
#background-wrap,
.login-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}
#background-wrap { display: none !important; }
.login-bg { display: block !important; }

@keyframes animateCloud {
  0% {
    margin-left: -500px;
  }

  100% {
    margin-left: 100%;
  }
}

.x1 {
  animation: animateCloud 30s linear infinite;
  transform: scale(0.65);
}

.x2 {
  animation: animateCloud 15s linear infinite;
  transform: scale(0.3);
}

.x3 {
  animation: animateCloud 25s linear infinite;
  transform: scale(0.5);
}

.x4 {
  animation: animateCloud 13s linear infinite;
  transform: scale(0.4);
}

.x5 {
  animation: animateCloud 20s linear infinite;
  transform: scale(0.55);
}

.cloud {
  background: linear-gradient(to bottom, #fff 5%, #f1f1f1 100%);
  border-radius: 100px;
  box-shadow: 0 8px 5px rgba(0, 0, 0, 0.1);
  height: 120px;
  width: 350px;
  position: relative;
}

.cloud:after,
.cloud:before {
  content: "";
  position: absolute;
  background: #fff;
  z-index: -1;
}

.cloud:after {
  border-radius: 100px;
  height: 100px;
  left: 50px;
  top: -50px;
  width: 100px;
}

.cloud:before {
  border-radius: 200px;
  height: 180px;
  width: 180px;
  right: 50px;
  top: -90px;
}

</style>
