import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const collectibleSource = await readFile(
  new URL('../src/components/InteractiveCollectibleCard.tsx', import.meta.url),
  'utf8',
)
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('revealed cards use the approved four-step completion screen', () => {
  assert.match(appSource, /className="registration-complete-screen"/)
  assert.match(appSource, /등록 완료/)
  assert.match(appSource, /4 \/ 4/)
  assert.match(appSource, /첫 카드가 컬렉션에 추가됐어요!/)
  assert.match(appSource, /className="registration-complete-progress"/)
})

test('random card registration hides identity before the reveal', () => {
  assert.match(appSource, /card-reveal-mystery-generated\.jpg/)
  assert.match(appSource, /'reveal-mystery-card is-revealing' : 'reveal-mystery-card'/)
  assert.match(appSource, /아직 공개되지 않은 랜덤 카드/)
  assert.match(appSource, /랜덤 카드가 도착했어요/)
  assert.match(appSource, /어떤 카드인지 공개하기 전까지 알 수 없어요/)
  assert.doesNotMatch(appSource, /filter:blur/)
})

test('card reveal is a dedicated third step before collection completion', () => {
  assert.match(appSource, /card-reveal-result/)
  assert.match(appSource, /카드 공개/)
  assert.match(appSource, /3 \/ 4/)
  assert.match(appSource, /새로운 카드를 발견했어요!/)
  assert.match(appSource, /isRandomReveal \? '하린'/)
  assert.match(appSource, /isRandomReveal \? 'Nebula Ver\.'/)
  assert.match(appSource, /DS-HR-024/)
  assert.match(appSource, /첫 카드 등록 보너스/)
  assert.match(appSource, /\+100 XP/)
  assert.match(appSource, /컬렉션에 추가/)
  assert.match(appSource, /다시 확인하기/)
  assert.match(cssSource, /\.card-reveal-result/)
  assert.match(cssSource, /\.card-reveal-bonus/)
})

test('random card reveal visibly stages the reveal before showing the card', () => {
  assert.match(appSource, /'mystery' \| 'revealing' \| 'revealed' \| 'complete'/)
  assert.match(appSource, /setPhase\('revealing'\)/)
  assert.match(appSource, /window\.setTimeout\(\(\) => setPhase\('revealed'\), 900\)/)
  assert.match(appSource, /reveal-mystery-card is-revealing/)
  assert.match(appSource, /카드를 공개하는 중이에요/)
  assert.match(cssSource, /@keyframes mystery-card-reveal/)
  assert.match(cssSource, /@keyframes mystery-reveal-flare/)
})

test('revealed cards can be flipped and inspected before collection addition', () => {
  assert.match(appSource, /<InteractiveCollectibleCard/)
  assert.match(appSource, /presentation="reveal"/)
  assert.match(appSource, /enableDeviceMotion=\{false\}/)
  assert.match(collectibleSource, /앞면과 뒷면을 눌러 카드를 확인해 보세요/)
})

test('completion screen reports live collection and fan progression', () => {
  assert.match(appSource, /phase === 'complete' && \(detail \|\| isRandomReveal\)/)
  assert.match(appSource, /const cardImage = isRandomReveal \? registrationCardImage/)
  assert.match(appSource, /collectionSummary\.ownedCount/)
  assert.match(appSource, /collectionSummary\.totalSlots/)
  assert.match(appSource, /fanProgression\?\.level\.level/)
  assert.match(appSource, /fanProgression\?\.level\.totalXp/)
  assert.match(appSource, /displayOwnedCount/)
  assert.match(appSource, /displayTotalSlots/)
  assert.match(appSource, /displayXpLabel/)
})

test('later acquisitions do not claim a first-card reward', () => {
  assert.match(appSource, /const isFirstCollectionCard = isRandomReveal \|\| collectionSummary\.ownedCount <= 1/)
  assert.match(appSource, /isFirstCollectionCard \? '첫 카드가 컬렉션에 추가됐어요!' : '카드가 컬렉션에 추가됐어요!'/)
  assert.match(appSource, /isFirstCollectionCard \? '첫 카드 등록 보너스' : '컬렉션 카드 획득'/)
  assert.match(appSource, /isFirstCollectionCard \? '\+100 XP' : '완료'/)
  assert.match(appSource, /isFirstCollectionCard \? '첫 카드 등록하기' : '새 카드 수집하기'/)
})

test('collection always exposes the card registration flow', () => {
  assert.match(appSource, /className="collection-register-entry"/)
  assert.match(appSource, /새 카드 등록하기/)
  assert.match(appSource, /onClick=\{onRedeem\}/)
})

test('registration visuals use the generated card asset and reference icons', () => {
  assert.match(appSource, /card-registration-idol-generated\.jpg/)
  assert.match(appSource, /registration-complete-celebration-v2\.png/)
  assert.match(appSource, /fan-level-star-v2\.png/)
  assert.match(appSource, /className="registration-complete-level-emblem"/)
  assert.match(appSource, /<NavIcon name="collection" \/>/)
  assert.match(appSource, /<RedeemIcon name="scan" \/>/)
  assert.match(appSource, /className="registration-complete-celebration"/)
  assert.match(appSource, /className="registration-complete-celebration-art"/)
  assert.match(cssSource, /\.registration-complete-celebration/)
  assert.doesNotMatch(appSource, /registration-complete-confetti/)
  const completionMarkup = appSource.slice(
    appSource.indexOf('className="registration-complete-hero"'),
    appSource.indexOf('className="registration-complete-mission"'),
  )
  assert.doesNotMatch(completionMarkup, /<InlineIcon name="sparkle" \/>/)
  assert.match(completionMarkup, /<InlineIcon name="users" \/>/)
  assert.doesNotMatch(appSource, /<InlineIcon name="sparkle" \/>/)
})

test('the Korean product name is consistently 팬폴리오', () => {
  assert.doesNotMatch(appSource, /팬포리오/)
  assert.doesNotMatch(appSource, /팬폴리오 시작하기/)
  assert.match(appSource, /홈으로 이동/)
})

test('completion actions remain connected to the collection, redeem, and home flows', () => {
  assert.match(appSource, /onViewCollection/)
  assert.match(appSource, /onRegisterAnother/)
  assert.match(appSource, /onStart/)
  assert.match(appSource, /보관함에서 카드 보기/)
  assert.match(appSource, /새 카드 더 등록하기/)
  assert.match(appSource, /홈으로 이동/)
})

test('completion layout stays mobile and scroll-safe', () => {
  assert.match(cssSource, /\.registration-complete-screen\{[^}]*width:min\(100%,430px\)/)
  assert.match(cssSource, /\.registration-complete-actions\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(cssSource, /@media\(max-width:360px\)\{[^}]*\.registration-complete-actions/s)
  assert.match(cssSource, /\.registration-complete-back \.inline-icon\{[^}]*display:block/)
})
