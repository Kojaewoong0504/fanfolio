import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const modalSource = readFileSync(new URL('../src/components/QrRedeemModal.tsx', import.meta.url), 'utf8')
const modalCss = readFileSync(new URL('../src/components/QrRedeemModal.css', import.meta.url), 'utf8')

test('card registration opens as the approved first step', () => {
  assert.match(modalSource, /className="modal redeem-modal redeem-flow-screen"/)
  assert.match(modalSource, /카드 등록/)
  assert.match(modalSource, /<em>\{step\}<\/em> \/ 4/)
  assert.match(modalSource, /첫 카드를 등록해볼까요\?/)
  assert.match(modalSource, /QR 코드 스캔/)
  assert.match(modalSource, /인증 코드 입력/)
  assert.match(modalSource, /사진으로 등록/)
})

test('card registration uses the generated project asset', () => {
  assert.match(modalSource, /card-registration-idol-generated\.png/)
  assert.match(modalSource, /className="redeem-flow-card-preview"/)
})

test('registration flow is a mobile full-height surface', () => {
  assert.match(modalCss, /\.redeem-flow-screen\s*\{[^}]*min-height:\s*100dvh/s)
  assert.match(modalCss, /\.redeem-flow-progress/)
  assert.match(modalCss, /\.redeem-flow-card-preview/)
})

test('the first-step CTA advances to a dedicated QR scan screen', () => {
  assert.match(modalSource, /const \[step, setStep\] = useState<RegistrationStep>\(1\)/)
  assert.match(modalSource, /step === 1/)
  assert.match(modalSource, /step === 2/)
  assert.match(modalSource, /QR 코드 스캔/)
  assert.match(modalSource, /카드 뒷면의 QR 코드를 비춰주세요/)
  assert.match(modalSource, /aria-valuenow=\{step\}/)
  assert.match(modalSource, /setStep\(2\)/)
  assert.match(modalSource, /scrollTo\(\{ top: 0/)
})

test('QR-free preview path hands off to the dedicated card reveal route', () => {
  assert.match(modalSource, /import\.meta\.env\.DEV/)
  assert.match(modalSource, /selectedMethod === 'photo'[\s\S]*import\.meta\.env\.DEV && <button[^>]*>샘플 카드로 3단계 미리보기/)
  assert.match(modalSource, /샘플 카드로 3단계 미리보기/)
  assert.match(modalSource, /step === 3/)
  assert.match(modalSource, /setStep\(3\)/)
  assert.match(modalSource, /onRedeemed\('qa-registration-complete'\)/)
})

test('QR scan screen uses a generated project scanner asset', () => {
  assert.match(modalSource, /card-registration-qr-scanner-generated\.png/)
  assert.match(modalSource, /className="redeem-flow-scan-stage"/)
  assert.match(modalSource, /카메라로 스캔 시작/)
  assert.match(modalCss, /\.redeem-flow-scan-stage/)
})

test('QR scan explicitly requests camera permission and offers a retry path', () => {
  assert.match(modalSource, /navigator\.mediaDevices\.getUserMedia\(/)
  assert.match(modalSource, /NotAllowedError|SecurityError/)
  assert.match(modalSource, /카메라 권한을 다시 요청|다시 시도/)
})
