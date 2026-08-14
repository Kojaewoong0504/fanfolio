import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const referenceCssSource = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')

test('email login field declares a stable browser autofill contract', () => {
  assert.match(appSource, /id="login-email"[^>]*name="email"/)
  assert.match(appSource, /id="login-email"[^>]*autoComplete="email"/)
  assert.match(appSource, /id="login-email"[^>]*inputMode="email"/)
})

test('fan email authentication uses a password instead of a magic link', () => {
  assert.match(appSource, /id="login-password"[^>]*name="password"/)
  assert.match(appSource, /id="login-password"[^>]*autoComplete=\{purpose === 'signup' \? 'new-password' : 'current-password'\}/)
  assert.match(appSource, /\/auth\/fan\/login/)
  assert.match(appSource, /\/auth\/fan\/signup/)
  assert.doesNotMatch(appSource, /로그인 링크 받기/)
  assert.doesNotMatch(appSource, /\/auth\/magic-link\/request/)
})

test('completed fan login returns to the home tab before loading growth data', () => {
  assert.match(appSource, /if \(!user\.onboardingCompleted\) return[\s\S]{0,120}navigateTab\('home'\)/)
})

test('browser-injected contact controls cannot escape the email input', () => {
  assert.match(cssSource, /::-webkit-contacts-auto-fill-button/)
  assert.match(cssSource, /::-webkit-credentials-auto-fill-button/)
})

test('approved login composition keeps the four providers and a collapsed email flow', () => {
  assert.match(appSource, /className="login-wordmark">FANFOLIO/)
  assert.match(appSource, /className="login-hero-stage"/)
  assert.match(appSource, /Apple로 계속하기[\s\S]*Google로 계속하기[\s\S]*카카오로 계속하기[\s\S]*네이버로 계속하기/)
  assert.match(appSource, /className="email-login-trigger"/)
  assert.match(appSource, /emailLoginOpen/)
})

test('login actions render crisp vector icons instead of screenshot crops', () => {
  assert.match(appSource, /function LoginProviderIcon/)
  assert.match(appSource, /className="login-provider-icon/)
  assert.match(appSource, /className="login-email-icon"/)
  assert.doesNotMatch(appSource, /provider-(?:apple|google|kakao|naver)\.png/)
  assert.doesNotMatch(appSource, /email-icon\.png/)
})

test('provider icon and label stay centered as one brand lockup', () => {
  assert.match(referenceCssSource, /\.login-screen \.social-button \{[^}]*display:\s*flex;[^}]*justify-content:\s*center;[^}]*gap:/s)
  assert.doesNotMatch(referenceCssSource, /\.login-screen \.social-button \{[^}]*grid-template-columns:/s)
  assert.doesNotMatch(referenceCssSource, /\.login-screen \.social-button::after/)
})

test('email icon and label stay centered as one action lockup', () => {
  assert.match(referenceCssSource, /\.email-login-trigger \{[^}]*display:\s*flex;[^}]*justify-content:\s*center;[^}]*gap:/s)
  assert.doesNotMatch(referenceCssSource, /\.email-login-trigger \{[^}]*grid-template-columns:/s)
  assert.doesNotMatch(referenceCssSource, /\.email-login-trigger::after/)
})

test('legacy provider styles never treat the text label as an icon', () => {
  assert.doesNotMatch(cssSource, /\.social-button span\s*\{/)
  assert.doesNotMatch(cssSource, /\.social-button\.(?:google|kakao) span\s*\{/)
  assert.match(referenceCssSource, /\.login-provider-label\s*\{[^}]*width:\s*auto;[^}]*height:\s*auto;[^}]*background:\s*transparent;[^}]*color:\s*inherit;/s)
})

test('provider marks are imported assets rather than hand-drawn inline svg', () => {
  assert.match(appSource, /import appleLoginIcon from '\.\/assets\/login\/apple\.svg'/)
  assert.match(appSource, /import googleLoginIcon from '\.\/assets\/login\/google\.svg'/)
  assert.match(appSource, /import kakaoLoginIcon from '\.\/assets\/login\/kakao\.svg'/)
  assert.match(appSource, /import naverLoginIcon from '\.\/assets\/login\/naver\.svg'/)
  assert.doesNotMatch(appSource, /function LoginProviderIcon[^}]*<svg/)
})
