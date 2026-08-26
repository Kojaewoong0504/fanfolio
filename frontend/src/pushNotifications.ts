export type PushPermissionContext = {
  supported: boolean
  permission: NotificationPermission
  explicit: boolean
}

export function shouldRequestPushPermission(context: PushPermissionContext): boolean {
  return context.supported && context.permission === 'default' && context.explicit
}

export function pushPlatform(): 'web' {
  return 'web'
}

function encodeServiceWorkerConfig(config: Record<string, string>): string {
  return btoa(JSON.stringify(config))
}

export async function enableWebPush(register: (token: string) => Promise<void>): Promise<'enabled' | 'unsupported' | 'denied'> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const permission = shouldRequestPushPermission({ supported: true, permission: Notification.permission, explicit: true })
    ? await Notification.requestPermission()
    : Notification.permission
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'unsupported'
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
  if (Object.values(config).some(value => !value) || !import.meta.env.VITE_FIREBASE_VAPID_KEY) return 'unsupported'
  const [{ initializeApp }, { getMessaging, getToken }] = await Promise.all([import('firebase/app'), import('firebase/messaging')])
  const app = initializeApp(config)
  const workerConfig = encodeURIComponent(encodeServiceWorkerConfig(config))
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?config=${workerConfig}`)
  const token = await getToken(getMessaging(app), { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration })
  if (!token) return 'unsupported'
  await register(token)
  return 'enabled'
}
