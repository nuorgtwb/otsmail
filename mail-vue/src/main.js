import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import './styles/ios-tokens.css';
import './styles/ios-overrides.css';
import './styles/redesign.css';
import { init } from '@/init/init.js';
import { createPinia } from 'pinia';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import perm from "@/perm/perm.js";
const pinia = createPinia().use(piniaPersistedState)
import i18n from "@/i18n/index.js";
const app = createApp(App).use(pinia)
await init()
app.use(router).use(i18n).directive('perm',perm)
app.config.devtools = true;

// Activate a newly installed service worker immediately; an old worker
// without the push handler can otherwise keep receiving pushes silently.
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
  navigator.serviceWorker.ready.then(registration => {
    registration.update().catch(() => {})
    const activate = worker => { if (worker) worker.postMessage({ type: 'SKIP_WAITING' }) }
    if (registration.waiting) activate(registration.waiting)
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') activate(worker)
      })
    })
  })
}

app.mount('#app');
