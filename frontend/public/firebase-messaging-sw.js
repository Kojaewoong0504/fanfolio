importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js')

function readFirebaseConfig() {
  const encoded = new URL(self.location.href).searchParams.get('config')
  if (!encoded) return null
  try {
    return JSON.parse(atob(decodeURIComponent(encoded)))
  } catch {
    return null
  }
}

const firebaseConfig = readFirebaseConfig()
if (firebaseConfig) {
  firebase.initializeApp(firebaseConfig)
  const messaging = firebase.messaging()
  messaging.onBackgroundMessage(payload => {
    const notification = payload.notification || {}
    const title = notification.title || 'FANFOLIO'
    const options = {
      body: notification.body || '새로운 소식이 도착했어요.',
      icon: notification.icon || '/favicon.svg',
      data: payload.data || {},
    }
    self.registration.showNotification(title, options)
  })
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(client => 'focus' in client)
      if (existing) {
        existing.navigate(targetUrl)
        return existing.focus()
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
