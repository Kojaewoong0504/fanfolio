import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldRequestPushPermission } from '../src/pushNotifications.ts'
import { readFile } from 'node:fs/promises'

test('push permission is requested only after explicit user intent', () => {
  assert.equal(shouldRequestPushPermission({ supported: true, permission: 'default', explicit: false }), false)
  assert.equal(shouldRequestPushPermission({ supported: true, permission: 'default', explicit: true }), true)
  assert.equal(shouldRequestPushPermission({ supported: true, permission: 'denied', explicit: true }), false)
})

test('firebase service worker handles background notifications and notification clicks', async () => {
  const source = await readFile(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8')
  assert.match(source, /firebase\.initializeApp\(firebaseConfig\)/)
  assert.match(source, /onBackgroundMessage/)
  assert.match(source, /showNotification/)
  assert.match(source, /openWindow\(targetUrl\)/)
})
