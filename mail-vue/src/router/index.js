import {createRouter, createWebHistory} from 'vue-router'
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {cvtR2Url} from "@/utils/convert.js";
import {getToken} from "@/utils/token-store.js"

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/inbox',
        component: () => import('@/layout/index.vue'),
        children: [
            {
                path: '/inbox',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'inbox',
                    name: 'email',
                    menu: true
                }
            },
            {
                path: '/all-mail',
                name: 'allMail',
                component: () => import('@/views/email/index.vue'),
                props: {mailbox: 'all'},
                meta: { title: 'allMail', name: 'allMail', menu: true, mailbox: 'all' }
            },
            {
                path: '/all-email',
                name: 'allEmail',
                component: () => import('@/views/all-email/index.vue'),
                meta: {title: 'allMail', name: 'allEmail', menu: false}
            },
            {
                path: '/analysis',
                name: 'analysis',
                component: () => import('@/views/analysis/index.vue'),
                meta: {title: 'analysis', name: 'analysis', menu: false}
            },
            {
                path: '/reg-key',
                name: 'regKey',
                component: () => import('@/views/reg-key/index.vue'),
                meta: {title: 'regKey', name: 'regKey', menu: false}
            },
            {
                path: '/mail',
                name: 'content',
                component: () => import('@/views/content/index.vue'),
                meta: {
                    title: 'message',
                    name: 'content',
                    menu: false
                }
            },
            {
                path: '/settings',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: 'settings',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/user',
                name: 'accountPermissions',
                component: () => import('@/views/user/index.vue'),
                meta: {title: 'AccountPermissions', name: 'accountPermissions', menu: false}
            },
            {
                path: '/sys-setting',
                name: 'sysSetting',
                component: () => import('@/views/sys-setting/index.vue'),
                meta: {title: 'SystemSettings', name: 'sysSetting', menu: false}
            },
            {
                path: '/starred',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: 'starred',
                    name: 'star',
                    menu: true
                }
            },
            {
                path: '/unread',
                name: 'unread',
                component: () => import('@/views/mailbox/index.vue'),
                props: {mailbox: 'unread'},
                meta: {title: 'unreadList', name: 'unread', menu: true, mailbox: 'unread'}
            },
            {
                path: '/deleted',
                name: 'deleted',
                component: () => import('@/views/mailbox/index.vue'),
                props: {mailbox: 'deleted'},
                meta: {title: 'deletedList', name: 'deleted', menu: true, mailbox: 'deleted'}
            },
            {
                path: '/spam',
                name: 'spam',
                component: () => import('@/views/mailbox/index.vue'),
                props: {mailbox: 'spam'},
                meta: {title: 'spamList', name: 'spam', menu: true, mailbox: 'spam'}
            },
            {
                path: '/sent',
                name: 'send',
                component: () => import('@/views/send/index.vue'),
                meta: {title: 'sent', name: 'send', menu: true}
            },
            {
                path: '/drafts',
                name: 'draft',
                component: () => import('@/views/draft/index.vue'),
                meta: {title: 'drafts', name: 'draft', menu: true}
            },
            {
                path: '/contacts',
                name: 'contacts',
                component: () => import('@/views/contacts/index.vue'),
                meta: {title: 'contacts', name: 'contacts', menu: true}
            },
        ]

    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        path: '/setup',
        name: 'setup',
        component: () => import('@/views/setup/index.vue')
    },
    {
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue')
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
]


const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

NProgress.configure({
    showSpinner: false,   // 不显示旋转图标
    trickleSpeed: 50,    // 自动递增速度
    minimum: 0.1          // 最小百分比
});

let timer
let first = true

router.beforeEach((to, from, next) => {

    if (timer) {
        clearTimeout(timer)
    }

    if (!first) {
        timer = setTimeout(() => {
            NProgress.start()
        }, 100)
    }

    // OAuth/OIDC 回调即使落到站点根，也必须回到登录页处理 code，否则绑定会被当成普通首页访问
    if (to.name !== 'login' && to.query.code) {
        return next({name: 'login', query: to.query})
    }

    const token = getToken()

    if (!token && to.name !== 'login' && to.name !== 'setup') {
        return next({name: 'login'})
    }

    if (!token && to.name === 'login') {
        loadBackground(next)
        return
    }

    if (token && to.name === 'login') {
        // 已在登录态，但若是第三方 OAuth / 绑定的回调（URL 带 code/state），
        // 必须放行进 /login 让 oauthGetUser() 处理（绑定/换 token），否则守卫直接跳走、回调永不处理。
        if (to.query && (to.query.state !== undefined || to.query.code !== undefined)) {
            return next()
        }
        return next(from.path)
    }

    next()

})

function loadBackground(next) {

    const settingStore = useSettingStore();

    if (settingStore.settings.background) {

        const src = cvtR2Url(settingStore.settings.background);

        let done = false;
        const proceed = () => {
            if (done) return;
            done = true;
            next();
        };

        const img = new Image();
        img.src = src;

        img.onload = proceed;

        img.onerror = () => {
            console.warn("背景图片加载失败:", img.src);
            proceed();
        };

        setTimeout(() => {
            console.warn("背景加载超时，已放行");
            proceed();
        }, 300)

    } else {
        next()
    }

}

router.afterEach((to) => {

    clearTimeout(timer)
    if (first) {
        removeLoading()
    } else {
        NProgress.done();
    }

    const uiStore = useUiStore()
    if (to.meta.menu) {
        if (['content', 'email', 'send'].includes(to.meta.name)) {
            uiStore.accountShow = window.innerWidth > 767;
        } else {
            uiStore.accountShow = false
        }
    }

    if (window.innerWidth < 1025) {
        uiStore.asideShow = false
    }

    first = false
})

function removeLoading() {
    const doc = document.getElementById('loading-first');
    if (!doc) {
        return;
    }

    doc.remove()
}

export default router
