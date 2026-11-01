/* Web Push：页面关闭后也由 Service Worker 显示系统通知 */
self.skipWaiting()
self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '新邮件' }
  }
  event.waitUntil(self.registration.showNotification(data.title || '新邮件', {
    body: data.body || '你收到一封新邮件',
    icon: '/mail-pwa.png',
    badge: '/mail-pwa.png',
    tag: data.tag || 'otsmail',
    renotify: true,
    data: { url: data.url || '/' }
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => client.url.startsWith(self.location.origin))
    if (existing) {
      existing.navigate(target)
      return existing.focus()
    }
    return self.clients.openWindow(target)
  }))
})
