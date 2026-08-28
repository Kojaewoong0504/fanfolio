import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  const next = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

test('shop product editor keeps admin shell and exposes a live preview panel', () => {
  const view = extractFunction('legacyShopProductCreateView')
  assert.match(view, /shop-product-editor/)
  assert.match(view, /shop-product-preview/)
  assert.match(view, /상품 상세 콘텐츠/)
  assert.match(source, /상품 소개/)
  assert.match(source, /구성품 안내/)
  assert.match(source, /구매 안내/)
  assert.match(view, /블록 추가/)
  assert.match(source, /shop-product-back/)
  assert.match(source, /상품 목록/)
})

test('shop product editor supports editing preview fields and content blocks', () => {
  assert.match(source, /function bindShopProductEditor\(/)
  assert.match(source, /data-shop-preview-field/)
  assert.match(source, /data-shop-content-block/)
  assert.match(source, /shop-product-preview-toggle/)
  assert.match(source, /block_type_/)
  assert.match(source, /block_image_/)
  assert.match(source, /이미지 URL/)
  assert.match(source, /type === "image"/)
})

test('shop product editor uses shared controls for operational selectors', () => {
  const view = extractFunction('shopProductCreateView')
  assert.match(view, /id: "shop-product-type"/)
  assert.match(view, /id: "shop-product-artist"/)
  assert.match(view, /id: "shop-product-exposure"/)
  assert.match(source, /shop-product-block-type-/)
  assert.match(source, /shop-product-card-pack|shop-product-reward/)
  assert.match(view, /adminSelect/)
  assert.match(view, /shop-product-type-select/)
})
