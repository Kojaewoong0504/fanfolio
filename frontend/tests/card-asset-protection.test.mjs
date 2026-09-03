import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const collectibleSource = readFileSync(new URL('../src/components/InteractiveCollectibleCard.tsx', import.meta.url), 'utf8')
const wishlistSource = appSource.slice(appSource.indexOf('function WishlistPicker'))
const servicesSource = readFileSync(new URL('../../backend/app/services.py', import.meta.url), 'utf8')

test('demo luminous cards use public assets that exist in the deployed asset route', () => {
  const luminousBlock = servicesSource.slice(servicesSource.indexOf('luminous_card_specs'), servicesSource.indexOf('for card_id, name, member_id, rarity, image_url in luminous_card_specs'))
  assert.doesNotMatch(luminousBlock, /\/assets\/card-(?:yuna-lavender|minho-midnight|jay-rosegold)\.jpg/)
  assert.match(luminousBlock, /\/assets\/demo\/dreamscape\/(?:harin|rina|sena)\.jpg/)
})

test('card images suppress direct image gestures without changing the in-app artwork', () => {
  assert.match(wishlistSource, /ProtectedCardImage/)
  assert.match(collectibleSource, /data-card-asset/)
  assert.match(collectibleSource, /onContextMenu=\{event => event\.preventDefault\(\)\}/)
  assert.doesNotMatch(wishlistSource, /watermark=/)
  assert.doesNotMatch(collectibleSource, /card-asset-watermark/)
})
