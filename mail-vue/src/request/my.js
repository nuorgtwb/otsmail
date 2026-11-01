import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

export function setAvatar(avatar) {
    return http.post('/my/setAvatar', {avatar})
}

export function uploadAvatar(base64) {
    return http.post('/my/uploadAvatar', {base64})
}

export function twoFactorStatus() {
    return http.get('/my/2fa/status')
}

export function twoFactorSetup() {
    return http.post('/my/2fa/setup')
}

export function twoFactorEnable(code) {
    return http.post('/my/2fa/enable', {code})
}

export function twoFactorDisable(data) {
    return http.post('/my/2fa/disable', data)
}

export function setTwoFactorRequired(required) {
    return http.put('/my/2fa/required', {required})
}


export function updateMySetting(data) {
    return http.put('/my/setting', data)
}

export function telegramBindTicket() {
    return http.post('/my/telegram/ticket')
}
