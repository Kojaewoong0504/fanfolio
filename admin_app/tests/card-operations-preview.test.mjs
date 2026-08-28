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

test('local preview combines card, pack, issue-code, and pack-composition screens', () => {
  assert.match(source, /localPreviewMode === "card-operations"/)
  assert.match(source, /function cardOperationsPreviewView\(/)
  assert.match(source, /\["cards", "카드 관리"/)
  assert.match(source, /\["packs", "카드팩 관리"/)
  assert.match(source, /\["codes", "발급·인증번호"/)
  assert.match(source, /data-card-ops-view="composition"/)
  assert.match(source, /카드 관리/)
  assert.match(source, /카드팩 관리/)
  assert.match(source, /발급·인증번호/)
  assert.match(source, /카드 구성 편집/)
  assert.match(source, /function packCreationPreview\(/)
  assert.match(source, /data-pack-creation-form/)
  assert.match(source, /function issuanceCreationPreview\(/)
  assert.match(source, /data-issuance-creation-form/)
})

test('pack composition exposes transparent odds with full card-level editing controls', () => {
  assert.match(source, /공개 확률표 미리보기/)
  assert.match(source, /팬앱 공개 확률표/)
  assert.match(source, /data-odds-mode="rarity"/)
  assert.match(source, /data-odds-mode="card"/)
  assert.match(source, /등급별 확률로 입력/)
  assert.match(source, /카드별 확률로 입력/)
  assert.match(source, /data-toggle-composition-card/)
  assert.match(source, /data-remove-composition-card/)
  assert.match(source, /저장 후 검수 요청/)
  assert.doesNotMatch(extractFunction('packCompositionPreview'), /version-lock-banner/)
  assert.doesNotMatch(extractFunction('packCompositionPreview'), /data-create-pack-version/)
  assert.doesNotMatch(extractFunction('packCompositionRows'), /rarity-select/)
})

test('card management uses clean thumbnails and selectable detail panel', () => {
  assert.doesNotMatch(extractFunction('previewCardThumb'), /rarity-/)
  assert.match(extractFunction('cardManagementPreview'), /data-preview-card-index/)
  assert.match(extractFunction('cardManagementPreview'), /card-detail-preview/)
  assert.match(extractFunction('cardManagementPreview'), /아티스트 메시지/)
  assert.match(extractFunction('cardManagementPreview'), /등록 경로/)
  assert.doesNotMatch(extractFunction('cardManagementPreview'), /source-info.*sync/)
  assert.match(extractFunction('cardManagementPreview'), /data-issuance-method/)
  assert.doesNotMatch(extractFunction('cardManagementPreview'), /카드 등록<\/button>/)
  assert.match(extractFunction('renderCardOperationsPreview'), /selectedCardIndex/)
  assert.match(extractFunction('cardManagementPreview'), /dataPreviewFilter: "cardArtist"/)
  assert.match(extractFunction('packManagementPreview'), /dataPreviewFilter: "packArtist"/)
  assert.match(extractFunction('renderCardOperationsPreview'), /data-preview-search/)
  assert.match(extractFunction('renderCardOperationsPreview'), /data-create-pack-version/)
  assert.match(extractFunction('renderCardOperationsPreview'), /view = "pack-create"/)
})

test('new pack version starts with a dedicated pack creation screen before composition editing', () => {
  const create = extractFunction('packCreationPreview')
  assert.match(create, /카드팩 이름/)
  assert.match(create, /카드팩 이미지/)
  assert.match(create, /data-create-pack/)
  assert.match(extractFunction('cardOperationsPreviewView'), /packCreate|packCreationPreview/)
  assert.doesNotMatch(extractFunction('packManagementPreview'), /새 버전 \$\{index \+ 1\}/)
})

test('issuance preview includes full batch tracking and selectable details', () => {
  const fn = extractFunction('issuanceCodesPreview')
  assert.match(fn, /예약/)
  assert.match(fn, /잔여 수량/)
  assert.match(fn, /CSV 내보내기/)
  assert.match(fn, /시작 시리얼/)
  assert.match(fn, /data-preview-batch-index/)
  assert.match(fn, /adminSelect\(/)
  assert.match(fn, /data-preview-search/)
  assert.match(fn, /dataPreviewFilter: "issuePeriod"/)
  assert.match(fn, /예약 배치/)
  assert.match(fn, /data-export-issuance-csv/)
  assert.match(fn, /issuePage/)
  assert.match(extractFunction('previewTablePagination'), /data-preview-issue-page/)
  assert.match(fn, /pagedItems\(/)
  assert.equal((fn.match(/추가 발급 배치 만들기/g) || []).length, 1)
  assert.match(extractFunction('renderCardOperationsPreview'), /selectedBatchIndex/)
  assert.match(extractFunction('renderCardOperationsPreview'), /data-export-issuance-csv/)
  assert.match(extractFunction('renderCardOperationsPreview'), /view = "issue-create"/)
  assert.match(extractFunction('renderCardOperationsPreview'), /data-preview-issue-page/)
})

test('new issuance batch starts with a dedicated registration screen', () => {
  const create = extractFunction('issuanceCreationPreview')
  assert.match(create, /배치명/)
  assert.match(create, /발급 수량/)
  assert.match(create, /인증번호 생성 방식/)
  assert.match(create, /data-issuance-creation-form/)
  assert.match(extractFunction('cardOperationsPreviewView'), /issue-create|issuanceCreationPreview/)
  assert.equal((extractFunction('issuanceCodesPreview').match(/추가 발급 배치 만들기/g) || []).length, 1)
})

test('issuance CSV helper escapes values and produces a downloadable table shape', () => {
  const sandbox = {}
  vm.createContext(sandbox)
  vm.runInContext(extractFunction('buildPreviewIssuanceCsv'), sandbox)
  assert.equal(
    sandbox.buildPreviewIssuanceCsv([['배치명', '설명'], ['Nebula, #001', '"사전 생성"']]),
    '배치명,설명\r\n"Nebula, #001","""사전 생성"""',
  )
  assert.match(extractFunction('downloadPreviewIssuanceCsv'), /URL\.createObjectURL/)
  assert.match(extractFunction('downloadPreviewIssuanceCsv'), /download/)
})

test('composition table makes ordering and alignment intentional', () => {
  const rows = extractFunction('packCompositionRows')
  assert.match(rows, /draggable="true"/)
  assert.match(rows, /data-composition-index/)
  assert.doesNotMatch(rows, /drag_indicator/)
  assert.match(extractFunction('packCompositionPreview'), /composition-table-footer/)
  assert.match(css, /composition-table[\s\S]*nth-child\(3\)/)
  assert.match(css, /preview-table-footer[\s\S]*justify-content: center/)
  assert.match(css, /issuance-detail-preview[\s\S]*overflow-y: visible/)
  assert.match(css, /issue-code-preview \.issuance-master-detail[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(css, /card-library-master-detail > \.card-detail-preview[\s\S]*margin-top: 0/)
  assert.match(css, /card-ops-master-detail > \.pack-detail-preview[\s\S]*margin-top: 0/)
  assert.match(css, /pack-composition-workbench > \.composition-main[\s\S]*margin-top: 0/)
  assert.match(css, /issuance-creation-layout > \.panel[\s\S]*margin-top: 0/)
  assert.match(css, /issue-code-preview \.code-batch-name strong[\s\S]*-webkit-line-clamp: 2/)
  assert.match(css, /issue-code-preview \.code-batch-name strong[\s\S]*white-space: normal/)
  assert.match(css, /issue-code-preview \.table th:first-child[\s\S]*width: 236px/)
  assert.match(css, /issue-code-preview \.code-batch-name[\s\S]*width: 100%[\s\S]*min-width: 0/)
  assert.match(css, /composition-table th:nth-child\(2\)[\s\S]*text-align: center/)
})

test('preview probability helper returns a stable percentage total', () => {
  const sandbox = {}
  vm.createContext(sandbox)
  vm.runInContext(extractFunction('calculatePreviewOddsTotal'), sandbox)
  assert.equal(sandbox.calculatePreviewOddsTotal([1, 9, 30, 60]), 100)
  assert.equal(sandbox.calculatePreviewOddsTotal(['0.5', '9.5', '', 90]), 100)
  assert.equal(sandbox.calculatePreviewOddsTotal([Number.NaN, -5, 105]), 105)
})

test('preview styling follows the admin shell and responsive workbench patterns', () => {
  assert.match(css, /\.card-ops-preview/)
  assert.match(css, /\.card-ops-subnav/)
  assert.match(css, /\.pack-composition-workbench/)
  assert.match(css, /\.odds-total\.valid/)
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.card-ops-preview/)
})
