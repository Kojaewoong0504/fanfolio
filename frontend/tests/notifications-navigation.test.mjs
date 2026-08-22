import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('notification entry remembers the route it should return to', () => {
  assert.match(appSource, /alertsReturnPathRef = useRef<string \| null>\(null\)/)
  assert.match(appSource, /const openAlerts = \(\) => \{[\s\S]*alertsReturnPathRef\.current = currentPath[\s\S]*navigateTab\('alerts'\)/)
  assert.match(appSource, /const closeAlerts = \(\) => \{[\s\S]*window\.history\.pushState\(\{\}, '', returnPath\)/)
  assert.match(appSource, /<Alerts[\s\S]*onBack=\{closeAlerts\}/)
  assert.match(appSource, /className="alerts-back-button"[\s\S]*onClick=\{onBack\}/)
})

test('notification screen uses compact utility sizing', () => {
  assert.match(cssSource, /\.alerts-reference-tabs button\{min-height:42px/)
  assert.match(cssSource, /\.notification-day \.alert-card\{grid-template-columns:46px/)
  assert.match(cssSource, /\.notification-empty-illustration\{width:92px;height:92px/)
})

test('reward, combination, and trade notifications open a useful fan destination', () => {
  assert.match(appSource, /kind === 'reward_claimed'\) return 'rewardInventory'/)
  assert.match(appSource, /kind === 'card_combined' \|\| kind === 'trade_accepted'\) return 'collection'/)
  assert.match(appSource, /if \(destination === 'rewardInventory'\) openRewardInventory\(\)/)
  assert.match(appSource, /else if \(destination === 'fanSocial'\) window\.location\.assign\('\/fans'\)/)
  assert.match(appSource, /else if \(destination === 'tradeInbox'\) window\.location\.assign\('\/trades'\)/)
  assert.match(appSource, /else navigateTab\(destination\)/)
})
