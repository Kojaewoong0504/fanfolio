import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/components/FanGrowth.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/components/FanGrowthReference.css', import.meta.url), 'utf8')

test('fan growth uses a deliberate loading screen before progression data arrives', () => {
  assert.match(source, /function FanGrowthLoading\(\)/)
  assert.match(source, /return <FanGrowthLoading \/>/)
  assert.match(source, /fan-growth-loading/)
  assert.match(css, /\.fan-growth\.full\.fan-growth-loading/)
})

test('fan growth shows explicit empty states when no public pass is available', () => {
  assert.match(source, /현재 공개된 팬 패스가 없어요/)
  assert.match(source, /현재 다음 보상이 없어요/)
  assert.match(source, /currentSeason && milestoneLevels\.length > 0/)
  assert.doesNotMatch(source, /관리자가 공개한 레벨 마일스톤 준비 중/)
})
