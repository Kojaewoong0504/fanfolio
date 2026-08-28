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
  assert.match(appSource, /<DetailTopBar title="알림" onBack=\{onBack\}/)
  assert.doesNotMatch(appSource, /<DetailTopBar title="알림"[^>]*right=/)
})

test('notification screen uses compact utility sizing', () => {
  assert.match(cssSource, /\.alerts-reference-tabs button\{min-height:42px/)
  assert.match(cssSource, /\.notification-day \.alert-card\{grid-template-columns:46px/)
  assert.match(cssSource, /\.notification-empty-illustration\{width:92px;height:92px/)
})

test('notification screen exposes an unread-only filter', () => {
  assert.match(appSource, /읽지 않음/)
  assert.match(appSource, /!item\.isRead/)
})

test('notification screen preserves server-provided body copy', () => {
  assert.match(appSource, /item\.body && <span className="notification-body">\{item\.body\}<\/span>/)
})

test('notification empty state is shown only when the filtered list is empty', () => {
  const alertsSource = appSource.slice(appSource.indexOf('function Alerts('), appSource.indexOf('type RevealCardProps'))
  const conditional = alertsSource.slice(alertsSource.indexOf('{groups.length > 0 ?'))
  const emptyStateIndex = conditional.indexOf('notification-empty')
  const fallbackIndex = conditional.indexOf(' : <div')
  assert.ok(emptyStateIndex > fallbackIndex, 'empty state must belong to the false branch')
  assert.equal(conditional.slice(0, fallbackIndex).includes('notification-empty'), false)
})

test('reward, combination, and trade notifications open a useful fan destination', () => {
  assert.match(appSource, /kind === 'reward_claimed'\) return 'rewardInventory'/)
  assert.match(appSource, /kind === 'card_combined' \|\| kind === 'trade_accepted'\) return 'collection'/)
  assert.match(appSource, /if \(destination === 'rewardInventory'\) openRewardInventory\(\)/)
  assert.match(appSource, /else if \(destination === 'fanSocial'\) navigateAppPath\('\/fans'\)/)
  assert.match(appSource, /else if \(destination === 'tradeInbox'\) navigateAppPath\('\/trades'\)/)
  assert.match(appSource, /else navigateTab\(destination\)/)
})
