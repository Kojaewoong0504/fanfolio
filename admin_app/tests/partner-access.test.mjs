import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

function functionBody(name) {
  const signature = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source)
  assert.ok(signature, `defines ${name}`)
  let depth = 1
  let index = signature.index + signature[0].length
  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(signature.index, index + 1)
  }
  assert.fail(`closes ${name} function body`)
}

function assertMatches(input, pattern, contract) {
  assert.ok(pattern.test(input), contract)
}

test('admin restores the live administrator scope before rendering navigation', () => {
  assert.match(source, /api\(["']\/admin\/me["']\)/)
  assert.match(source, /adminContext/)
  assert.match(source, /allowedActions/)
})

test('root-only artist profile review data is not requested by partner administrators', () => {
  const loadDataStart = source.indexOf('async function loadData()')
  const rootBranchStart = source.indexOf('if (isRoot())', loadDataStart)
  const rootBranchEnd = source.indexOf('} else {', rootBranchStart)
  const partnerSafePrelude = source.slice(loadDataStart, rootBranchStart)
  const rootBranch = source.slice(rootBranchStart, rootBranchEnd)

  assert.doesNotMatch(partnerSafePrelude, /api\(["']\/admin\/artist-profiles["']\)/)
  assert.match(rootBranch, /api\(["']\/admin\/artist-profiles["']\)/)
})

test('root navigation includes partner operations while partner navigation is scoped', () => {
  assert.match(source, /data-view=["']partners["']/)
  assert.match(source, /accessLevel\s*===\s*["']root["']/)
  assert.match(source, /파트너/)
  assert.match(source, /서비스 사용자/)
  assert.match(source, /드롭·코드/)
  assert.match(source, /기업 관리자 계정이 발급되었습니다/)
})

test('partner directory has list and detail regions with overview member and artist tabs', () => {
  assert.match(source, /partner-directory/)
  assert.match(source, /partner-list-column/)
  assert.match(source, /partner-detail/)
  assert.match(source, /개요/)
  assert.match(source, /관리자/)
  assert.match(source, /아티스트/)
})

test('root can create partner members and assign artists from drawers', () => {
  assert.match(source, /member-drawer/)
  assert.match(source, /artist-assignment-drawer/)
  assert.match(source, /\/organizations\/\$\{[^}]+\}\/members/)
  assert.match(source, /\/members\/\$\{[^}]+\}\/artists/)
  assert.match(source, /temporaryPassword/)
  assert.match(source, /const formElement = event\.currentTarget/)
  assert.match(source, /formElement\.reset\(\)/)
})

test('hosted runtime settings do not expose editable API or bootstrap email fields', () => {
  assert.doesNotMatch(source, /id=["']api-base["']/)
  assert.doesNotMatch(source, /save-settings/)
  assert.doesNotMatch(source, /value=["']admin@fanfolio\.com["']/)
})

test('partner contract dates are submitted and displayed without timezone drift', () => {
  assert.match(source, /T00:00:00\.000Z/)
  assert.match(source, /T23:59:59\.999Z/)
  assert.match(source, /formatContractDate/)
})

test('partner registration reports the failing stage instead of masking API errors', () => {
  assert.match(source, /let writeResult/)
  assert.match(source, /요청에 실패했습니다/)
  assert.match(source, /파트너 목록을 새로 고치지 못했습니다/)
  assert.match(source, /String\(error\?\.message \|\| error\)/)
  assert.match(source, /loadOrganizations\(false\)/)
})

test('partner card detail exposes the scoped review request action', () => {
  assert.match(source, /cards:submit_review/)
  assert.match(source, /검수 요청하기/)
  assert.match(source, /\/admin\/cards\/\$\{[^}]+\}\/submit-review/)
})

test('assigned artists expose an editable profile drawer for authorized staff', () => {
  assert.match(source, /artist-edit-drawer/)
  assert.match(source, /cards:write|artists:write/)
  assert.match(source, /아티스트 정보 수정/)
  assert.match(source, /\/admin\/artists\/\$\{[^}]+\}/)
})

test('admin explains partner operations and separates studio creation from operations publishing', () => {
  assert.match(source, /id: "guide"/)
  assert.match(source, /운영 가이드/)
  assert.match(source, /아티스트 스튜디오/)
  assert.match(source, /운영 카드 등록/)
  assert.match(source, /organization-form-error/)
})

test('admin uses accessible custom controls for role and artist review changes', () => {
  assert.doesNotMatch(source, /<select class="role-change"/)
  assert.doesNotMatch(source, /<select class="artist-profile-artist"/)
  assert.match(source, /admin-select-trigger/)
  assert.match(source, /admin-select-option/)
  assert.match(source, /profile-review-actions/)
})

test('admin gives a useful card preview fallback when stored media is unavailable', () => {
  assert.match(source, /review-image-fallback/)
  assert.match(source, /원본 이미지가 등록되지 않았거나 저장소에서 찾을 수 없습니다/)
  assert.match(source, /previewImageUrl.*sourceImageUrl/)
})

test('partner logo picker is optional and exposes preview replacement and removal controls', () => {
  const drawer = functionBody('organizationDrawer')
  assertMatches(drawer, /organization-logo-preview/, 'renders a partner logo preview frame')
  assertMatches(drawer, /remove-organization-logo/, 'renders a partner logo removal action')
  assertMatches(drawer, /optional-label/, 'marks partner logo selection as optional')
  assertMatches(
    drawer,
    /<input\b(?=[^>]*\bid=["']organization-logo-input["'])(?=[^>]*\btype=["']file["'])(?=[^>]*\baccept=["']image\/png,image\/jpeg,image\/webp["'])[^>]*>/s,
    'limits picker choices to PNG JPEG and WebP images',
  )
})

test('partner logo save uploads the selected file as an organization logo asset payload', () => {
  const save = functionBody('saveOrganization')
  assertMatches(
    save,
    /payload\.logoAssetId\s*=\s*await\s+uploadAsset\(\s*state\.organizationLogoFile\s*,\s*["']organization_logo["']\s*\)/,
    'sets logoAssetId from uploadAsset(state.organizationLogoFile, organization_logo)',
  )
})

test('partner logo upload rejects unsupported file types and files over two megabytes', () => {
  const setter = functionBody('setOrganizationLogoFile')
  assertMatches(
    setter,
    /allowedTypes\s*=\s*\[[^\]]*["']image\/png["'][^\]]*["']image\/jpeg["'][^\]]*["']image\/webp["'][^\]]*\]/s,
    'validates PNG JPEG and WebP logo MIME types',
  )
  assertMatches(setter, /file\.size\s*>\s*2\s*\*\s*1024\s*\*\s*1024/, 'validates partner logos against a 2MB limit')
  assertMatches(setter, /PNG.*JPG.*WebP/s, 'explains supported logo formats in validation errors')
})

test('partner logos use a shared renderer with image error fallback', () => {
  const renderer = functionBody('partnerLogoMarkup')
  assertMatches(renderer, /company-avatar-fallback/, 'renders an initial fallback for partners without usable logos')
  assertMatches(
    renderer,
    /onerror=["'][^"']*hidden\s*=\s*true[^"']*nextElementSibling[^"']*hidden\s*=\s*false/s,
    'falls back to initials when partner logo images fail to load',
  )
})
