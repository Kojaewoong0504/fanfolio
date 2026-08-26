import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

test('admin exposes a destination-safe delivery failure queue with retry controls', () => {
  assert.match(source, /notification-deliveries\?/)
  assert.match(source, /data-delivery-retry/)
  assert.match(source, /전달 실패 큐/)
  assert.match(source, /재시도 대기열/)
  assert.match(source, /option value="pending"/)
  assert.match(source, /engagement:retry/)
  assert.match(css, /\.delivery-queue-panel/)
  assert.match(css, /\.delivery-table/)
})

test('successful delivery queue refresh clears a stale administrator error', () => {
  assert.match(source, /async function loadDeliveryQueue\(renderAfter = true\)[\s\S]*?state\.error = "";/)
})
