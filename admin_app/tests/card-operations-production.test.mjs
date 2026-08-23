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

test('production issuance list restores operational tracking controls', () => {
  const view = extractFunction('batchesView')
  assert.match(view, /예약 배치/)
  assert.match(view, /잔여 수량/)
  assert.match(view, /전체 상태/)
  assert.match(view, /전체 카드 유형/)
  assert.match(view, /전체 기간/)
  assert.match(extractFunction('issuanceDetailView'), /CSV 내보내기/)
  assert.match(extractFunction('issuanceBatchRows'), /data-batch-id/)
})

test('production issuance creation collects the backend batch contract', () => {
  const view = extractFunction('issuanceCreationView')
  assert.match(view, /id="batch-form"/)
  assert.match(view, /id: "batch-card", name: "cardId"/)
  assert.match(view, /id: "batch-drop", name: "dropId"/)
  assert.match(view, /name="quantity"/)
  assert.match(view, /name="maxUsesPerCode"/)
  assert.match(view, /name="expiresAt"/)
  assert.match(view, /name="prefix"/)
  assert.match(extractFunction('createBatch'), /state\.view = "batches"/)
})
