<template>
  <div class="setup-page">
    <div class="setup-card">
      <h1>otsmail 初始化</h1>
      <p class="setup-desc">
        输入部署时设置的 <code>init_secret</code>，初始化数据库。该操作只能执行一次。
      </p>
      <el-input
        v-model="secret"
        type="password"
        show-password
        placeholder="init_secret"
        size="large"
        @keyup.enter="init"
      />
      <el-button class="setup-btn" type="primary" size="large" :loading="loading" @click="init">
        初始化数据库
      </el-button>
      <p v-if="message" class="setup-message" :class="ok ? 'ok' : 'error'">{{ message }}</p>
      <router-link v-if="ok" class="setup-link" to="/login">前往登录</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const secret = ref('')
const loading = ref(false)
const ok = ref(false)
const message = ref('')

async function init() {
  if (!secret.value || loading.value) return
  loading.value = true
  message.value = ''
  try {
    const base = (import.meta.env.VITE_BASE_URL || '/api').replace(/\/$/, '')
    const res = await fetch(`${base}/init`, { headers: { 'X-Init-Secret': secret.value } })
    ok.value = res.ok
    message.value = res.ok
      ? '初始化完成，可以登录了。'
      : '初始化失败：密钥错误，或数据库已经初始化过。'
  } catch (e) {
    ok.value = false
    message.value = `初始化失败：${e.message}`
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.setup-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f5f7fb;
  padding: 24px;
}
.setup-card {
  width: min(440px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
}
h1 { font-size: 24px; margin: 0 0 10px; color: #111827; }
.setup-desc { color: #6b7280; font-size: 14px; line-height: 1.7; margin: 0 0 22px; }
.setup-btn { width: 100%; margin-top: 14px; }
.setup-message { font-size: 14px; margin: 14px 0 0; }
.setup-message.ok { color: #15803d; }
.setup-message.error { color: #b91c1c; }
.setup-link { display: inline-block; margin-top: 14px; color: #2563eb; text-decoration: none; }
</style>
