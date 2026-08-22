import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const referenceCssSource = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')

test('fan client exposes server-backed wishlist and collection goal contracts', () => {
  assert.match(clientSource, /export type CollectionGoal = \{[\s\S]*?packId: string[\s\S]*?completionRate: number[\s\S]*?\}/)
  assert.match(clientSource, /export function getWishlist\(/)
  assert.match(clientSource, /export function saveWishlistCard\(/)
  assert.match(clientSource, /export function removeWishlistCard\(/)
  assert.match(clientSource, /export function getCollectionGoals\(/)
  assert.match(clientSource, /export function createCollectionGoal\(/)
  assert.match(clientSource, /export function deleteCollectionGoal\(/)
})

test('card collection uses server wishlist and exposes a progress goal for the active pack', () => {
  assert.match(appSource, /getWishlist\(/)
  assert.match(appSource, /saveWishlistCard\(/)
  assert.match(appSource, /removeWishlistCard\(/)
  assert.match(appSource, /getCollectionGoals\(/)
  assert.match(appSource, /createCollectionGoal\(/)
  assert.match(appSource, /collection-goal-card/)
  assert.match(appSource, /completionRate/)
  assert.match(referenceCssSource, /\.collection-goal-card\s*\{/)
})
