import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const appCssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const redeemSource = await readFile(new URL('../src/components/QrRedeemModal.tsx', import.meta.url), 'utf8')
const inventorySource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const mediaHookSource = await readFile(new URL('../src/hooks/useAuthenticatedMedia.ts', import.meta.url), 'utf8')

test('card pack opening has loading, duplicate-submit, and failure states', () => {
  assert.match(appSource, /if \(!selectedRemotePack \|\| !onOpenCard \|\| packOpening\) return/)
  assert.match(appSource, /setPackOpening\(true\)/)
  assert.match(appSource, /setPackOpening\(false\)/)
  assert.match(appSource, /카드를 준비하고 있어요…/)
  assert.match(appSource, /카드팩을 열지 못했어요\. 잠시 후 다시 시도해 주세요\./)
  assert.match(appSource, /role="alert"/)
})

test('QR camera and image-registration failures return to a manual fallback', () => {
  assert.match(redeemSource, /카메라를 사용할 수 없습니다\. 권한을 확인하거나 코드를 직접 입력해 주세요\./)
  assert.match(redeemSource, /사진에서 QR을 찾지 못했습니다\. 더 선명한 사진을 사용하거나 코드를 직접 입력해 주세요\./)
  assert.match(redeemSource, /setReadingImage\(true\)/)
  assert.match(redeemSource, /setReadingImage\(false\)/)
  assert.match(redeemSource, /인증 코드 입력/)
})

test('redeem confirmation does not claim an unverified code was already checked', () => {
  assert.match(redeemSource, /입력한 인증 코드/)
  assert.match(redeemSource, /서버에서 인증번호를 최종 확인한 뒤 컬렉션에 추가해요\./)
  assert.doesNotMatch(redeemSource, /인증 코드 확인 완료/)
})

test('reward inventory separates an empty result from a service error', () => {
  assert.match(inventorySource, /!loading && error && <div className="reward-inventory-state error" role="alert">/)
  assert.match(inventorySource, /!loading && !error && claimedRewards\.length === 0/)
  assert.match(inventorySource, /아직 보유한 팬 아이템이 없어요/)
  assert.match(inventorySource, /보상을 불러오지 못했어요\./)
  assert.match(inventorySource, /onRetry\}/)
})

test('card repository keeps owned cards visible when the catalog has no matching pack', () => {
  assert.match(appSource, /const ungroupedCards = ownedCards\.filter\(card => !matchedCardIds\.has\(card\.cardId\)\)/)
  assert.match(appSource, /displayName: '등록 카드'/)
  assert.match(appSource, /packs: \[\{ id: groupId, name: '등록 카드'/)
})

test('standalone card detail exposes secondary metadata instead of hiding it on mobile', () => {
  assert.match(appCssSource, /\.detail-reference-meta \.detail-meta-secondary\{display:flex\}/)
})

test('protected card media is loaded with the authenticated blob path before playback', () => {
  assert.match(appSource, /useAuthenticatedMedia\(voiceAudioPath, mediaRetryKey\)/)
  assert.match(appSource, /useAuthenticatedMedia\(videoPath, mediaRetryKey\)/)
  assert.match(mediaHookSource, /fetchAuthenticatedMedia\(path\)/)
  assert.match(mediaHookSource, /error: !url/)
})
