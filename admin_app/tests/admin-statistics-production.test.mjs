import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

test('production navigation exposes statistics only with statistics read permission', () => {
  assert.match(source, /can\("statistics:read"\)/)
  assert.match(source, /id: "statistics", label: "통계"/)
})

test('production statistics loads the scoped backend endpoint', () => {
  assert.match(source, /function loadStatistics\(/)
  assert.match(source, /\/admin\/statistics/)
  assert.match(source, /state\.statistics = result\.data;\s+state\.error = "";/)
  assert.match(source, /function statisticsView\(/)
  assert.match(source, /state\.statistics/)
})

test('production statistics supports period compare and scoped filters', () => {
  assert.match(source, /statisticsPeriod/)
  assert.match(source, /statisticsCompare/)
  assert.match(source, /statisticsOrganization/)
  assert.match(source, /statisticsArtist/)
  assert.match(source, /statisticsPack/)
})

test('production statistics hides comparison deltas when comparison is disabled', () => {
  assert.match(source, /const comparisonEnabled = Boolean\(data\.period\.compare\)/)
  assert.match(source, /change: comparisonEnabled \? metric\.change : null/)
  assert.match(source, /if \(value === null \|\| value === undefined\) return ""/)
  assert.match(source, /delta \? `<em/)
  assert.match(source, /: "선택 기간"/)
})
