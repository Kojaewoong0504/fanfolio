import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

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

async function loadAdminHarness() {
  const appElement = { innerHTML: '' }
  const context = {
    console,
    setTimeout,
    URL: {
      created: [],
      revoked: [],
      createObjectURL(file) {
        const value = `blob:${file.name}`
        this.created.push(value)
        return value
      },
      revokeObjectURL(value) {
        this.revoked.push(value)
      },
    },
    window: {
      location: { hostname: 'localhost' },
      localStorage: { getItem: () => null },
    },
    document: {
      onkeydown: null,
      addEventListener() {},
      querySelector(selector) {
        return selector === '#app' ? appElement : null
      },
      querySelectorAll() {
        return []
      },
    },
    fetch: async () => {
      throw new Error('offline')
    },
    requestAnimationFrame(callback) {
      callback()
    },
  }
  context.window.document = context.document
  vm.createContext(context)
  vm.runInContext(`${source}\nglobalThis.__adminTest = { state, organizationDrawer, partnerLogoMarkup, setOrganizationLogoFile, removeOrganizationLogo, resetOrganizationLogoState };`, context)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return context
}

async function loadLogoHarness({ hostname = 'localhost', apiBase = null } = {}) {
  const appElement = { innerHTML: '' }
  const context = {
    console,
    setTimeout,
    URL,
    window: {
      location: { hostname },
      localStorage: { getItem: () => apiBase },
    },
    document: {
      onkeydown: null,
      addEventListener() {},
      querySelector(selector) {
        return selector === '#app' ? appElement : null
      },
      querySelectorAll() {
        return []
      },
    },
    fetch: async () => {
      throw new Error('offline')
    },
    requestAnimationFrame(callback) {
      callback()
    },
  }
  context.window.document = context.document
  vm.createContext(context)
  vm.runInContext(`${source}
globalThis.__logoTest = {
  resolvePartnerLogoUrl: typeof resolvePartnerLogoUrl === 'function' ? resolvePartnerLogoUrl : undefined,
  partnerLogoMarkup,
};`, context)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return context.__logoTest
}

function fakeOrganizationForm() {
  const nameInput = { value: 'Unsaved Company Name' }
  const slugInput = { value: 'unsaved-company' }
  const picker = { innerHTML: '' }
  const errorBox = { textContent: '', hidden: true }
  const listeners = []
  const fileInput = {
    addEventListener(type, handler) {
      listeners.push({ target: 'file', type, handler })
    },
  }
  const removeButton = {
    addEventListener(type, handler) {
      listeners.push({ target: 'remove', type, handler })
    },
  }
  const logoImage = {
    dataset: {},
    hidden: false,
    nextElementSibling: { hidden: true },
    addEventListener(type, handler) {
      listeners.push({ target: 'image', type, handler })
    },
  }
  const form = {
    querySelector(selector) {
      return {
        'input[name="name"]': nameInput,
        'input[name="slug"]': slugInput,
        '.organization-logo-picker': picker,
        '#organization-form-error': errorBox,
        '#organization-logo-input': fileInput,
        '#remove-organization-logo': removeButton,
        '[data-partner-logo-image]': logoImage,
      }[selector] || null
    },
    querySelectorAll(selector) {
      return selector === '[data-partner-logo-image]' ? [logoImage] : []
    },
  }
  return { form, nameInput, slugInput, picker, listeners, logoImage }
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
  const api = functionBody('api')
  const save = functionBody('saveOrganization')
  assert.match(api, /errorCode\s*=\s*body\?\.error\?\.code/)
  assert.match(api, /error\.code\s*=\s*errorCode/)
  assert.match(save, /error\.code\s*===\s*["']ORGANIZATION_SLUG_TAKEN["']/)
  assert.match(save, /recoverOrganizationBySlug\(payload\.slug\)/)
  assert.doesNotMatch(save, /error\.status\s*===\s*409\s*\?\s*["']이미 사용 중인 파트너 코드/)
  assert.match(source, /let writeResult/)
  assert.match(source, /요청에 실패했습니다/)
  assert.match(source, /파트너 목록을 새로 고치지 못했습니다/)
  assert.match(source, /String\(error\?\.message \|\| error\)/)
  assert.match(source, /loadOrganizations\(false\)/)
})

test('duplicate partner recovery bypasses active directory filters and requires an exact slug', () => {
  const recovery = functionBody('recoverOrganizationBySlug')
  assert.match(recovery, /new URLSearchParams\(\{ query: slug, page: ["']1["'], pageSize: ["']100["'] \}\)/)
  assert.match(recovery, /organization\.slug === slug/)
  assert.doesNotMatch(recovery, /partnerStatus/)
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

test('admin uses accessible custom controls in dedicated role and artist review panels', () => {
  assert.doesNotMatch(source, /<select class="role-change"/)
  assert.doesNotMatch(source, /<select class="artist-profile-artist"/)
  assert.match(source, /admin-select-trigger/)
  assert.match(source, /admin-select-option/)
  assert.match(source, /function artistProfileReviewDrawer/)
  assert.match(source, /id="artist-profile-review-form"/)
})

test('admin gives a useful card preview fallback when stored media is unavailable', () => {
  assert.match(source, /review-image-fallback/)
  assert.match(source, /원본 이미지가 등록되지 않았거나 저장소에서 찾을 수 없습니다/)
  assert.match(source, /previewImageUrl.*sourceImageUrl/)
})

test('card review exposes front and back media plus a meaningful creator label', () => {
  assert.match(source, /data-review-side="front"/)
  assert.match(source, /data-review-side="back"/)
  assert.match(source, /backImageUrl/)
  assert.match(source, /cardCreatorLabel\(card\)/)
  assert.match(source, /뒷면 이미지/)
})

test('card review reproduces stored studio effects as an interactive preview', () => {
  assert.match(source, /function reviewEffectConfig\(card\)/)
  assert.match(source, /data-review-effect-card/)
  assert.match(source, /data-review-effects/)
  assert.match(source, /--review-light-x/)
  assert.match(source, /reviewEffectSummary\(card\)/)
})

test('artist account review is clearly separated from card review', () => {
  assert.match(source, /아티스트 계정·소속 승인/)
  assert.match(source, /카드 검수는 카드 관리 메뉴에서 진행합니다/)
})

test('admin uses the shared Fanfolio bitmap favicon', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /fanfolio-app-icon-192\.png/)
  assert.doesNotMatch(html, /href="data:,"/)
})

test('admin brand mark is the actual Fanfolio app icon and missing media has a recovery upload', () => {
  assert.match(source, /nav-brand-mark[^>]*>.*fanfolio-app-icon-192\.png/s)
  assert.match(source, /function adminBrandMark\(\)[\s\S]*fanfolio-app-icon-192\.png/)
  assert.doesNotMatch(source, /brand-lockup">\$\{icon\("auto_awesome_motion"\)\}/)
  assert.match(source, /data-review-upload="front"/)
  assert.match(source, /data-review-upload="back"/)
  assert.match(source, /replaceReviewImage/)
})

test('admin entrypoint busts stale app script caches after a deployment', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /app\.js\?v=season-pass-admin-20260818/)
})

test('partner logo picker is optional and exposes preview replacement and removal controls', () => {
  const drawer = functionBody('organizationDrawer')
  const picker = functionBody('organizationLogoPickerContents')
  assertMatches(drawer, /organizationLogoPickerContents/, 'renders the shared partner logo picker')
  assertMatches(picker, /organization-logo-preview/, 'renders a partner logo preview frame')
  assertMatches(picker, /remove-organization-logo/, 'renders a partner logo removal action')
  assertMatches(picker, /optional-label/, 'marks partner logo selection as optional')
  assertMatches(picker, /add_photo_alternate/, 'shows an upload icon when no partner logo is selected')
  assertMatches(picker, /organizationLogoFile\?\.name/, 'shows the selected partner logo file name')
  assertMatches(
    picker,
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
  assertMatches(save, /else\s+if\s*\(\s*state\.organizationLogoRemoved\s*\)[\s\S]*payload\.logoAssetId\s*=\s*null/, 'sends explicit null only when a partner logo is removed')
  assertMatches(save, /로고 업로드에 실패했습니다/, 'reports upload failures before saving the organization')
  assertMatches(save, /resetOrganizationLogoState\(\)/, 'resets temporary logo state after a successful organization save')
  assert.doesNotMatch(save, /logoAssetId\s*:\s*editing\?\.logoAssetId/, 'does not preserve existing logos by resubmitting logoAssetId during ordinary edits')
})

test('partner logo temporary state is reset and object URLs are revoked without leaks', () => {
  const resetter = functionBody('resetOrganizationLogoState')
  assertMatches(resetter, /URL\.revokeObjectURL\(state\.organizationLogoPreviewUrl\)/, 'revokes existing object URL previews before reset')
  assertMatches(resetter, /organizationLogoFile\s*=\s*null/, 'clears selected logo files on reset')
  assertMatches(resetter, /organizationLogoPreviewUrl\s*=\s*["']["']/, 'clears selected logo previews on reset')
  assertMatches(resetter, /organizationLogoRemoved\s*=\s*false/, 'clears explicit logo removal state on reset')

  const closer = functionBody('closeDrawer')
  assertMatches(closer, /resetOrganizationLogoState\(\)/, 'closing the drawer clears temporary logo state')
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
  assertMatches(setter, /URL\.revokeObjectURL\(state\.organizationLogoPreviewUrl\)/, 'revokes the replaced logo preview object URL')
  assertMatches(setter, /URL\.createObjectURL\(file\)/, 'creates a local logo preview object URL')
  assertMatches(setter, /organizationLogoRemoved\s*=\s*false/, 'clears explicit removal state when a replacement logo is selected')
  assertMatches(setter, /renderOrganizationLogoPicker\(\s*form\s*\)/, 'updates only the logo picker after selecting a logo')
  assert.doesNotMatch(setter, /layout\(\)/, 'does not rerender the full admin layout after selecting a logo')
})

test('partner logo remove updates only the picker instead of discarding organization form edits', () => {
  const remover = functionBody('removeOrganizationLogo')
  assertMatches(remover, /renderOrganizationLogoPicker\(\s*form\s*\)/, 'updates only the logo picker after removing a logo')
  assert.doesNotMatch(remover, /layout\(\)/, 'does not rerender the full admin layout after removing a logo')
})

test('partner logos use a shared renderer with image error fallback', () => {
  const renderer = functionBody('partnerLogoMarkup')
  assertMatches(renderer, /company-avatar-fallback/, 'renders an initial fallback for partners without usable logos')
  assertMatches(renderer, /data-partner-logo-image/, 'marks logo images for CSP-safe fallback binding')
  assert.doesNotMatch(renderer, /onerror\s*=/, 'does not use inline onerror handlers')

  const binder = functionBody('bindPartnerLogoFallbacks')
  assertMatches(binder, /addEventListener\(\s*["']error["']/, 'binds partner logo error fallback with addEventListener')
  assertMatches(binder, /nextElementSibling/, 'reveals the rendered initial fallback when a logo image fails')
})

test('partner logo API paths resolve to the configured API origin during local development', async () => {
  const harness = await loadLogoHarness({
    hostname: '127.0.0.1',
    apiBase: 'http://localhost:8000/api',
  })

  assert.equal(
    harness.resolvePartnerLogoUrl('/api/organizations/org_123/logo'),
    'http://127.0.0.1:8000/api/organizations/org_123/logo',
  )
  assert.match(
    harness.partnerLogoMarkup({
      name: 'Acme',
      logoUrl: '/api/organizations/org_123/logo',
    }),
    /src="http:\/\/127\.0\.0\.1:8000\/api\/organizations\/org_123\/logo"/,
  )
})

test('partner logo API paths remain same-origin outside local development', async () => {
  const harness = await loadLogoHarness({ hostname: 'admin.fanfolio.kr' })

  assert.equal(
    harness.resolvePartnerLogoUrl('/api/organizations/org_123/logo'),
    '/api/organizations/org_123/logo',
  )
  assert.match(
    harness.partnerLogoMarkup({
      name: 'Acme',
      logoUrl: '/api/organizations/org_123/logo',
    }),
    /src="\/api\/organizations\/org_123\/logo"/,
  )
})

test('partner logo select and remove preserve unsaved organization form input values', async () => {
  const context = await loadAdminHarness()
  const harness = context.__adminTest
  const { form, nameInput, slugInput, picker, listeners, logoImage } = fakeOrganizationForm()
  harness.state.drawerData = {
    organization: { name: 'Persisted Name', slug: 'persisted', logoUrl: '/api/logo.png' },
  }

  harness.setOrganizationLogoFile({ name: 'replacement.png', type: 'image/png', size: 42 }, form)
  assert.equal(nameInput.value, 'Unsaved Company Name')
  assert.equal(slugInput.value, 'unsaved-company')
  assert.equal(harness.state.organizationLogoPreviewUrl, 'blob:replacement.png')
  assert.match(picker.innerHTML, /blob:replacement\.png/)
  const imageError = listeners.find((listener) => listener.target === 'image' && listener.type === 'error')
  assert.ok(imageError, 'binds a CSP-safe image error listener during picker updates')
  imageError.handler()
  assert.equal(logoImage.hidden, true)
  assert.equal(logoImage.nextElementSibling.hidden, false)

  harness.removeOrganizationLogo(form)
  assert.equal(nameInput.value, 'Unsaved Company Name')
  assert.equal(slugInput.value, 'unsaved-company')
  assert.equal(harness.state.organizationLogoRemoved, true)
  assert.equal(harness.state.organizationLogoPreviewUrl, '')
  assert.ok(context.URL.revoked.includes('blob:replacement.png'))
  assert.doesNotMatch(picker.innerHTML, /blob:replacement\.png/)
})
