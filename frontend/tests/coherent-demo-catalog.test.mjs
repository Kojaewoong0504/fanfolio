import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../src/assets/demo-catalog.ts', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('demo catalog has one stable female DREAMSCAPE member set', () => {
  assert.match(source, /member_yuna.*member_harin.*member_sena.*member_rina/s)
  assert.match(source, /role: '리더 · 보컬'/)
  assert.doesNotMatch(source, /member_minho|member_jei|member_doyun|member_minjae/)
})

test('preview cards no longer pair old member names with unrelated portraits', () => {
  assert.doesNotMatch(app, /member: '도윤'|member: '민재'/)
  assert.doesNotMatch(app, /member: '하린', image: cardMinhoImage/)
  assert.doesNotMatch(app, /member: '제이', image: cardYunaImage/)
})

test('hosted fan app proxies API-served catalog assets and keeps the login visual', () => {
  const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  assert.match(vercel, /"src": "\/assets\/demo\/\(\.\*\)"/)
  assert.match(app, /loginDreamscapeGroup from '\.\/assets\/login\/dreamscape-group\.png'/)
})

test('discover event hero uses the authenticated media loader', () => {
  assert.match(app, /featuredEventImage \? <AuthenticatedImage src=\{featuredEvent\?\.heroUrl\} fallback=\{dreamscapeHero\}/)
})
