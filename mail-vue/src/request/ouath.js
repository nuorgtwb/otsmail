import http from '@/axios/index.js';

export function oauthLinuxDoLogin(code, state, nonce) {
    return http.post('/oauth/linuxDo/login',{code, state, nonce})
}

export function oauthGithubLogin(code, state, nonce) {
    return http.post('/oauth/github/login',{code, state, nonce})
}

export function oauthGoogleLogin(code, state, nonce) {
    return http.post('/oauth/google/login',{code, state, nonce})
}

// 企业 SSO（OIDC）：provider 为空时后端取第一个启用的服务商
export function oidcConfig(providerId) {
    return http.get('/oauth/oidc/config', {params: providerId ? {provider: providerId} : {}})
}

export function oauthOidcLogin(code, state, provider, codeVerifier, nonce) {
    return http.post('/oauth/oidc/login', {code, state, provider, codeVerifier, nonce})
}

export function oauthBindUser(form) {
    return http.put('/oauth/bindUser', form)
}

// v1.3 登录态绑定（大网站模式）：已登录用户把当前 OAuth 授权绑到自己的站内账号
export function oauthBind(form) {
    return http.put('/oauth/bind', form)
}

export function oauthBindings() {
    return http.get('/oauth/bindings')
}

export function oauthSetBindingActive(provider, active) {
    return http.put('/oauth/bindings/active', {provider, active})
}

export function oauthUnbind(provider) {
    return http.post('/oauth/unbind', {provider})
}
