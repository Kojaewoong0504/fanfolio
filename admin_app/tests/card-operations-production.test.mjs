import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

test('production navigation exposes card pack and issuance operations under cards', () => {
  assert.match(source, /data-view="card-packs"/)
  assert.match(source, /data-view="batches"/)
  assert.match(source, /카드팩 관리/)
  assert.match(source, /발급·인증번호/)
  assert.doesNotMatch(source, /<nav>\$\{items\}\$\{cardSection\}<\/nav>/)
})

test('production card pack screens use the admin card-pack API', () => {
  assert.match(source, /function cardPacksView\(/)
  assert.match(source, /function cardPackCreateView\(/)
  assert.match(source, /function cardPackCompositionView\(/)
  assert.match(source, /api\("\/admin\/card-packs"/)
  assert.match(source, /api\(`\/admin\/card-packs\//)
  assert.match(source, /method: "POST"/)
  assert.match(source, /method: "PATCH"/)
  assert.match(source, /card-pack-composition-form/)
  assert.match(source, /카드팩의 아티스트와 포함 카드의 아티스트를 같게 선택해 주세요/)
})

test('production issuance screen remains connected to batch creation and exports', () => {
  assert.match(source, /function batchesView\(/)
  assert.match(source, /api\("\/admin\/redeem-code-batches"/)
  assert.match(source, /csvExportUrl/)
  assert.match(source, /qrZipUrl/)
})

test('production issuance uses dedicated list and creation views', () => {
  assert.match(source, /"issuance-create": issuanceCreationView/)
  assert.match(source, /data-view="issuance-create"/)
  assert.match(source, /function issuanceCreationView\(/)
  assert.match(source, /function issuanceDetailView\(/)
})
