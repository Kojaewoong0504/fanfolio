import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

function extractFunction(name) {
  const marker = `function ${name}(`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `expected ${name} to exist`)
  const bodyStart = source.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`could not extract ${name}`)
}

test('statistics preview has a local entry point and isolated renderer', () => {
  assert.match(source, /localPreviewMode === "statistics"/)
  assert.match(source, /function statisticsPreviewView\(/)
  assert.match(source, /function renderStatisticsPreview\(/)
  assert.match(source, /statistics-preview/)
})

test('statistics preview supports root and partner scopes with working controls', () => {
  const view = extractFunction('statisticsPreviewView')
  const render = extractFunction('renderStatisticsPreview')
  assert.match(view, /data-statistics-scope="root"/)
  assert.match(view, /data-statistics-scope="partner"/)
  assert.match(view, /data-statistics-period/)
  assert.match(view, /data-statistics-filter/)
  assert.match(view, /data-statistics-compare/)
  assert.match(render, /statisticsPreviewState\.scope/)
  assert.match(render, /statisticsPreviewState\.period/)
  assert.match(render, /statisticsPreviewState\[select\.dataset\.statisticsFilter\]/)
})

test('root dashboard contains operational outcomes and integrity monitoring', () => {
  const root = extractFunction('rootStatisticsPreview')
  assert.match(root, /전체 활성 팬/)
  assert.match(root, /팬 성장과 카드팩 개봉 추이/)
  assert.match(root, /카드팩 성과/)
  assert.match(root, /발급 전환 퍼널/)
  assert.match(root, /운영 이상 징후/)
  assert.match(root, /공개 확률 대비 실제 발급/)
})

test('partner dashboard stays scoped to partner and artist outcomes', () => {
  const partner = extractFunction('partnerStatisticsPreview')
  assert.match(partner, /파트너 활성 팬/)
  assert.match(partner, /아티스트별 팬 활동/)
  assert.match(partner, /컬렉션 현황/)
  assert.match(partner, /카드팩별 성과/)
  assert.match(partner, /공개 확률 대비 실제 발급/)
})

test('chart helper generates stable SVG points for empty and populated series', () => {
  const sandbox = { Math }
  vm.createContext(sandbox)
  vm.runInContext(extractFunction('statisticsChartPoints'), sandbox)
  assert.equal(sandbox.statisticsChartPoints([], 100, 40), '')
  assert.equal(sandbox.statisticsChartPoints([5], 100, 40), '0,20')
  assert.equal(sandbox.statisticsChartPoints([0, 10], 100, 40), '0,40 100,0')
})

test('statistics preview styling is responsive and namespaced', () => {
  assert.match(css, /\.statistics-preview/)
  assert.match(css, /\.statistics-kpi-grid/)
  assert.match(css, /\.statistics-dashboard-grid/)
  assert.match(css, /\.statistics-trend-chart/)
  assert.match(css, /\.statistics-funnel/)
  assert.match(css, /\.statistics-odds-grid/)
  assert.match(css, /\.statistics-dashboard-grid\s*>\s*\.statistics-panel:nth-child\(3\)/)
  assert.match(css, /\.statistics-chart-legend\s*\{[\s\S]*position:\s*absolute/)
  assert.match(css, /\.statistics-trend-panel\s+\.statistics-panel-caption\s*\{[\s\S]*display:\s*none/)
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.statistics-dashboard-grid/)
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.statistics-kpi-grid/)
})
