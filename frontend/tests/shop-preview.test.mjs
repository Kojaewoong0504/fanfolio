import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const appCssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('development preview exposes the selected shop design', () => {
  assert.match(appSource, /preview === 'shop'/)
  assert.match(appSource, /function ShopPreview\(/)
  assert.match(appSource, /className="app-shell shop-shell"/)
  assert.match(appSource, /<h1>상점<\/h1>/)
  assert.match(appSource, /포인트와 카드팩으로 컬렉션을 완성해보세요\./)
  assert.match(appSource, /document\.title = 'Fanfolio · 상점'/)
})

test('shop keeps artist scope, balance, and history ahead of the catalog', () => {
  const shopSource = appSource.slice(appSource.indexOf('function ShopPreview('), appSource.indexOf('function readCardRoutePreview('))
  assert.match(shopSource, /관심 아티스트/)
  assert.match(shopSource, /aria-label="전체 아티스트 상품 보기"/)
  assert.match(shopSource, /드림스케이프/)
  assert.match(shopSource, /루나라이즈/)
  assert.match(shopSource, /3,250/)
  assert.match(shopSource, /구매 · 교환 내역/)
  assert.ok(shopSource.indexOf('구매 · 교환 내역') < shopSource.indexOf('shop-category-tabs'))
})

test('shop categories are interactive and use an active shop bottom tab', () => {
  const shopSource = appSource.slice(appSource.indexOf('function ShopPreview('), appSource.indexOf('function readCardRoutePreview('))
  assert.match(shopSource, /useState<ShopCategory>\('recommended'\)/)
  assert.match(shopSource, /setCategory\(item\.id\)/)
  assert.match(shopSource, /aria-selected=\{category === item\.id\}/)
  assert.match(shopSource, /className="nav-item active"[^>]*aria-current="page"/)
  assert.match(shopSource, /<NavIcon name="shop" \/>/)
})

test('shop layout follows the compact mobile design system', () => {
  assert.match(appCssSource, /\.shop-shell\{/)
  assert.match(appCssSource, /\.shop-artist-list\{[^}]*overflow-x:auto/s)
  assert.match(appCssSource, /\.shop-artist-list\{[^}]*scroll-snap-type:x proximity/s)
  assert.match(appCssSource, /\.shop-artist-list button\{[^}]*flex:0 0/s)
  assert.match(appCssSource, /\.shop-history-link\{/)
  assert.match(appCssSource, /\.shop-category-tabs\{/)
  assert.match(appCssSource, /\.shop-featured-pack\{/)
  assert.match(appCssSource, /\.shop-secondary-packs\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s)
})

test('shop history button opens a dedicated preview route', () => {
  const shopSource = appSource.slice(appSource.indexOf('function ShopPreview('), appSource.indexOf('function readCardRoutePreview('))
  assert.match(shopSource, /appMode \? '\/shop\/history' : '\/\?preview=shop-history'/)
  assert.match(appSource, /preview === 'shop-history'/)
  assert.match(appSource, /function ShopHistoryPreview\(/)
})

test('shop is available in the authenticated app routes, not only preview mode', () => {
  assert.match(appSource, /pathname === '\/shop\/checkout'.*ShopCheckoutPreview appMode/s)
  assert.match(appSource, /pathname === '\/shop\/history'.*ShopHistoryPreview appMode/s)
  assert.match(appSource, /if \(tab === 'shop'\) return <ShopPreview appMode/)
  assert.match(appSource, /if \(tab === 'shop'\)[\s\S]*onOpenAlerts=\{openAlerts\}/)
  assert.match(appSource, /if \(tab === 'shop'\)[\s\S]*onOpenProfile=\{\(\) => navigateTab\('settings'\)\}/)
  assert.match(appSource, /pathname === '\/shop' \|\| pathname\.startsWith\('\/shop\/'\)/)
  assert.match(appSource, /shop: '\/shop'/)
  assert.match(appSource, /<NavItem active=\{active === 'shop'\} label="상점" icon="shop"/)
})

test('authenticated shop header keeps profile and notification actions connected', () => {
  const shopSource = appSource.slice(appSource.indexOf('function ShopPreview('), appSource.indexOf('function readCardRoutePreview('))
  assert.match(shopSource, /onOpenAlerts\?\./)
  assert.match(shopSource, /onOpenProfile\?\./)
  assert.match(appSource, /<ShopPreview appMode/)
  assert.match(appSource, /<ShopPreview appMode[\s\S]*onOpenAlerts=\{openAlerts\}/)
  assert.match(appSource, /<ShopPreview appMode[\s\S]*onOpenProfile=\{\(\) => navigateTab\('settings'\)\}/)
})

test('authenticated shop reads catalog data and opens a real product detail', () => {
  assert.match(appSource, /getShopProducts\(\{ artistId: artist \?\? undefined \}\)/)
  assert.match(appSource, /getShopProduct\(productId\)/)
  assert.match(appSource, /createShopOrder\(product\.id\)/)
  assert.match(appSource, /function ShopProductDetail\(/)
  assert.match(appSource, /shop\/products\/\$\{encodeURIComponent\(product\.id\)\}/)
  assert.match(appSource, /navigateAppPath\(`\/shop\/checkout\?productId=/)
})

test('authenticated shop reuses the preview shell and keeps live navigation', () => {
  assert.doesNotMatch(appSource, /if \(appMode\) return <ShopApiPage \/>/)
  assert.match(appSource, /useEffect\(\(\) => \{[\s\S]*getShopProducts\(\{ artistId: artist \?\? undefined \}\)/)
  assert.match(appSource, /className="shop-points-card"/)
  assert.match(appSource, /className="shop-category-tabs"/)
  assert.match(appSource, /className="bottom-nav" aria-label="주요 메뉴"/)
  assert.match(appSource, /onClick=\{\(\) => appMode && navigateAppPath\('\/discover'\)\}/)
  assert.match(appSource, /getFanPoints\(\)/)
  assert.doesNotMatch(appSource, /aria-label="보유 포인트 3,250 포인트"/)
})

test('shop product detail renders admin-authored detail content blocks', () => {
  assert.match(appSource, /detailContent/)
  assert.match(appSource, /shop-product-detail-block/)
  assert.match(appSource, /block\.type === 'image'/)
  assert.match(appSource, /shop-product-detail-media/)
  assert.match(appCssSource, /\.app-shell\.shop-product-detail-shell\{[^}]*padding:0 0 28px/)
})

test('shop detail routes reuse the shared detail top bar and keep points art clear', () => {
  assert.match(appSource, /<DetailTopBar title="구매 · 교환 내역"/)
  assert.match(appSource, /<DetailTopBar title="상품 상세"/)
  assert.doesNotMatch(appSource, /<header className="shop-history-topbar detail-topbar">/)
  assert.doesNotMatch(appSource, /<span className="shop-points-art"[^>]*>[\s\S]*<b>P<\/b>/)
  assert.match(appCssSource, /\.shop-points-art img\{[^}]*object-fit:contain/)
})

test('shop detail layouts are bounded by the shared app canvas', () => {
  assert.match(appCssSource, /\.shop-history-shell\{[^}]*padding:0 0 28px/)
  assert.match(appCssSource, /\.shop-product-detail-shell\{[^}]*width:min\(100%,430px\)/)
  assert.match(appCssSource, /\.shop-history-content[\s\S]*padding:\s*var\(--detail-content-start\) var\(--detail-content-gutter\) 32px/)
})

test('shop history preview filters realistic purchase and exchange records', () => {
  const historySource = appSource.slice(appSource.indexOf('function ShopHistoryPreview('), appSource.indexOf('function ShopPreview('))
  assert.match(historySource, /useState<ShopHistoryFilter>\('all'\)/)
  assert.match(historySource, /setFilter\(item\.id\)/)
  assert.match(appSource, /2026년 8월/)
  assert.match(appSource, /DREAMSCAPE Nebula Ver\. 카드팩/)
  assert.match(appSource, /포인트 500P 교환/)
  assert.match(historySource, /최근 1년간의 구매 및 교환 내역을 확인할 수 있어요\./)
  assert.match(historySource, /appMode \? '\/shop' : '\/\?preview=shop'/)
  assert.match(historySource, /getFanPoints\(\)/)
  assert.match(historySource, /const sourceRecords = appMode \? liveRecords : shopHistoryRecords/)
})

test('shop history layout matches the selected mobile detail design', () => {
  assert.match(appCssSource, /\.shop-history-shell\{/)
  assert.match(appCssSource, /\.shop-history-summary\{[^}]*grid-template-columns:/s)
  assert.match(appCssSource, /\.shop-history-filters\{[^}]*grid-template-columns:repeat\(3,1fr\)/s)
  assert.match(appCssSource, /\.shop-history-card\{/)
  assert.match(appCssSource, /\.shop-history-note\{/)
})

test('shop exposes the selected payment information checkout flow', () => {
  assert.match(appSource, /preview === 'shop-checkout'/)
  assert.match(appSource, /function ShopCheckoutPreview\(/)
  assert.match(appSource, /type ShopPaymentMethod = 'points' \| 'card' \| 'kakao' \| 'naver'/)
  assert.match(appSource, /결제 정보/)
  assert.match(appSource, /포인트 우선 사용/)
  assert.match(appSource, /setPaymentMethod\(item\.id\)/)
  assert.match(appSource, /구매 완료/)
  assert.match(appSource, /appMode \? '\/shop\/checkout' : '\/\?preview=shop-checkout'/)
  assert.match(appSource, /getShopProduct\(productId\)/)
  assert.match(appSource, /createShopOrder\(product\.id\)/)
})

test('checkout layout preserves the compact shop design system', () => {
  assert.match(appCssSource, /\.shop-checkout-shell\{/)
  assert.match(appCssSource, /\.shop-checkout-method\{/)
  assert.match(appCssSource, /\.shop-checkout-summary\{/)
  assert.match(appCssSource, /\.shop-checkout-footer[,{]/)
})
