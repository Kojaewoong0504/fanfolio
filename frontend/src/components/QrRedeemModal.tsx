import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { previewRedemption, redeemCard, type CardRedemption, type RedemptionPreview, type RedemptionSource } from '../api/client'
import '../App.css'
import './QrRedeemModal.css'
import { DetailTopBar } from './DetailTopBar'
import { normalizeQrValue } from './qrUtils'
import registrationCardImage from '../assets/card-registration-idol-generated.jpg'
import qrScannerImage from '../assets/card-registration-qr-scanner-generated.jpg'

type RegistrationMethod = 'qr' | 'manual' | 'photo'
type RegistrationStep = 1 | 2 | 3

function isRedemptionErrorMessage(message: string): boolean {
  return ['실패', '찾을 수', '찾지 못', '비활성화', '사용할 수', '이미 사용', '만료된', '만료되었습니다', '카메라를 사용할 수 없습니다', 'HTTPS 연결'].some(keyword => message.includes(keyword))
}

export function QrRedeemModal({ onClose, onRedeemed }: { onClose: () => void, onRedeemed: (redemption: CardRedemption) => void }) {
  const [step, setStep] = useState<RegistrationStep>(1)
  const [code, setCode] = useState('')
  // QR is the primary digital-card path. Keep manual entry behind an explicit
  // choice so the first modal view is about selecting a digital source, not
  // staring at a generic text field.
  const [source, setSource] = useState<RedemptionSource>('qr')
  const [selectedMethod, setSelectedMethod] = useState<RegistrationMethod>('qr')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [readingImage, setReadingImage] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [preview, setPreview] = useState<RedemptionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const scannerControlsRef = useRef<IScannerControls | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLParagraphElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    backdropRef.current?.scrollTo({ top: 0 })
  }, [step])

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.querySelector<HTMLElement>('.redeem-modal .detail-topbar-back')?.focus()
    return () => previousActiveElementRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const dialog = document.querySelector<HTMLElement>('.redeem-modal[role="dialog"]')
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], audio[controls]'))
        .filter(element => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!scanning) return
    let cancelled = false
    const scan = async () => {
      if (!videoRef.current) return
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage('이 브라우저에서는 카메라를 사용할 수 없습니다. 사진으로 QR을 읽거나 코드를 직접 입력해 주세요.')
        setCameraError(true)
        setScanning(false)
        return
      }
      if (!window.isSecureContext) {
        setMessage('카메라 스캔은 HTTPS 연결에서만 사용할 수 있어요. 사진으로 QR을 읽거나 코드를 직접 입력해 주세요.')
        setCameraError(true)
        setScanning(false)
        return
      }
      try {
        // Request permission in the user-initiated scanner flow first. ZXing
        // also opens a stream, but its rejection does not reliably preserve
        // the browser error name needed for a useful recovery message.
        const permissionStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        permissionStream.getTracks().forEach(track => track.stop())
        if (cancelled) return
        // Load the camera decoder only when the user opens the scanner. This
        // keeps login, collection, and discovery startup bundles small.
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        const reader = new BrowserQRCodeReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (!result || cancelled) return
            setCode(normalizeQrValue(result.getText()))
            setSource('qr')
            setMessage('QR 코드가 인식되었습니다.')
            controls.stop()
            scannerControlsRef.current = null
            setScanning(false)
            setStep(3)
          },
        )
        if (cancelled) controls.stop()
        else scannerControlsRef.current = controls
      } catch (error) {
        const cameraException = error instanceof DOMException ? error.name : ''
        if (cameraException === 'NotAllowedError' || cameraException === 'SecurityError') {
          setMessage('카메라 권한이 꺼져 있어요. 브라우저 설정에서 카메라를 허용한 뒤 다시 시도해 주세요.')
        } else if (cameraException === 'NotFoundError') {
          setMessage('사용할 수 있는 카메라를 찾지 못했어요. 사진으로 QR을 읽거나 코드를 직접 입력해 주세요.')
        } else {
          setMessage('카메라를 사용할 수 없습니다. 권한을 확인하거나 다시 시도해 주세요.')
        }
        setCameraError(true)
        setScanning(false)
      }
    }
    void scan()
    return () => {
      cancelled = true
      scannerControlsRef.current?.stop()
      scannerControlsRef.current = null
    }
  }, [scanning])

  const readQrImage = async (file: File | undefined) => {
    if (!file) return
    setCode('')
    setSource('qr')
    setReadingImage(true)
    setMessage('사진에서 QR 코드를 찾는 중입니다.')
    const imageUrl = URL.createObjectURL(file)
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const reader = new BrowserQRCodeReader()
      let result
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // Some WebKit/Chromium versions do not consistently finish decoding
          // a blob URL when it is passed directly to ZXing. Loading the image
          // element explicitly gives the decoder a stable, decoded bitmap.
          const image = new Image()
          image.src = imageUrl
          await image.decode()
          try {
            result = await reader.decodeFromImageElement(image)
          } catch (elementError) {
            // Keep the URL decoder as a fallback for browsers that handle the
            // blob URL better than an HTMLImageElement.
            lastError = elementError
            result = await reader.decodeFromImageUrl(imageUrl)
          }
          break
        } catch (error) {
          lastError = error
          if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 120))
        }
      }
      if (!result) throw lastError ?? new Error('QR_IMAGE_NOT_FOUND')
      setCode(normalizeQrValue(result.getText()))
      setSource('qr')
      setMessage('사진에서 QR 코드가 인식되었습니다.')
      setStep(3)
    } catch {
      setMessage('사진에서 QR을 찾지 못했습니다. 더 선명한 사진을 사용하거나 코드를 직접 입력해 주세요.')
    } finally {
      URL.revokeObjectURL(imageUrl)
      setReadingImage(false)
    }
  }

  const redeem = async () => {
    setSaving(true)
    setMessage('')
    try {
      const result = await redeemCard(code, source)
      onRedeemed(result.data)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '카드 등록에 실패했습니다.')
    } finally { setSaving(false) }
  }

  const onQrImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    void readQrImage(event.target.files?.[0])
    event.currentTarget.value = ''
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (step !== 2 || source !== 'manual' || scanning) return
    const frame = window.requestAnimationFrame(() => codeInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [scanning, source, step])

  useEffect(() => {
    if (step !== 3 || isDemo || !code.trim()) return
    let cancelled = false
    setPreview(null)
    setPreviewLoading(true)
    setMessage('카드 정보를 확인하는 중입니다.')
    void previewRedemption(code, source)
      .then(result => { if (!cancelled) { setPreview(result.data); setMessage('카드 정보를 확인했습니다.') } })
      .catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : '카드 정보를 확인할 수 없습니다.') })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [code, isDemo, source, step])

  useEffect(() => {
    if (!message || !isRedemptionErrorMessage(message)) return
    const frame = window.requestAnimationFrame(() => messageRef.current?.scrollIntoView({ block: 'nearest' }))
    return () => window.cancelAnimationFrame(frame)
  }, [message])

  const messageIsError = isRedemptionErrorMessage(message)
  const continueRegistration = () => {
    setMessage('')
    setIsDemo(false)
    setStep(2)
    if (selectedMethod === 'qr') {
      setCode('')
      setSource('qr')
      setCameraError(false)
      setScanning(false)
      return
    }
    if (selectedMethod === 'photo') {
      setSource('qr')
      window.requestAnimationFrame(() => photoInputRef.current?.click())
      return
    }
    setSource('manual')
    window.requestAnimationFrame(() => codeInputRef.current?.focus())
  }

  const startScanning = () => {
    setMessage('')
    setCameraError(false)
    setScanning(true)
  }

  const goBack = () => {
    setMessage('')
    setScanning(false)
    if (step === 1) onClose()
    else setStep(previous => Math.max(1, previous - 1) as RegistrationStep)
  }

  const previewDemoCard = () => {
    if (!import.meta.env.DEV) return
    setCode('FANFOLIO-DEMO-CARD')
    setSource('qr')
    setIsDemo(true)
    setScanning(false)
    onRedeemed({ userCardId: 'qa-registration-complete', cardId: 'qa-card', serialNumber: 1, growthEventId: 'qa-growth', growthStatus: 'processed', awardedXp: 0 })
  }

  const confirmRegistration = () => {
    if (import.meta.env.DEV && isDemo) {
      onRedeemed({ userCardId: 'qa-registration-complete', cardId: 'qa-card', serialNumber: 1, growthEventId: 'qa-growth', growthStatus: 'processed', awardedXp: 0 })
      return
    }
    void redeem()
  }

  const title = step === 1 ? '카드 등록' : step === 2 ? (selectedMethod === 'manual' ? '인증 코드 입력' : selectedMethod === 'photo' ? '사진으로 등록' : 'QR 코드 스캔') : '카드 확인'

  return <div ref={backdropRef} className="modal-backdrop redeem-flow-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal redeem-modal redeem-flow-screen" data-step={step} role="dialog" aria-modal="true" aria-label={title}>
      <DetailTopBar
        title={title}
        onBack={goBack}
        backLabel={step === 1 ? '카드 등록 닫기' : '이전 단계'}
        right={<strong className="redeem-flow-step-count" aria-label={`${step} / 4 단계`}><em>{step}</em> / 4</strong>}
      />
      <div className="redeem-flow-progress" role="progressbar" aria-label="카드 등록 진행률" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step}><span style={{ width: `${step * 25}%` }} /></div>

      {step === 1 && <>
        <section className="redeem-flow-intro">
          <h1>첫 카드를 등록해볼까요?</h1>
          <p>보유한 카드를 간편하게 컬렉션에 추가해보세요.</p>
        </section>

        <div className="redeem-flow-card-preview" aria-hidden="true">
          <img src={registrationCardImage} alt="" />
          <span>SR</span>
        </div>

        <div className="redeem-flow-methods" role="radiogroup" aria-label="카드 등록 방법">
          <button type="button" role="radio" aria-checked={selectedMethod === 'qr'} className={selectedMethod === 'qr' ? 'redeem-flow-method selected' : 'redeem-flow-method'} onClick={() => { setSelectedMethod('qr'); setSource('qr'); setScanning(false) }}>
            <RedeemIcon name="scan" /><span><b>QR 코드 스캔</b><small>카드 뒷면의 QR 코드를 촬영해요.</small></span><RedeemIcon name="chevron" />
          </button>
          <button type="button" role="radio" aria-checked={selectedMethod === 'manual'} className={selectedMethod === 'manual' ? 'redeem-flow-method selected' : 'redeem-flow-method'} onClick={() => { setSelectedMethod('manual'); setSource('manual'); setScanning(false) }}>
            <RedeemIcon name="code" /><span><b>인증 코드 입력</b><small>카드의 12자리 코드를 직접 입력해요.</small></span><RedeemIcon name="chevron" />
          </button>
          <button type="button" role="radio" aria-checked={selectedMethod === 'photo'} className={selectedMethod === 'photo' ? 'redeem-flow-method selected' : 'redeem-flow-method'} onClick={() => { setSelectedMethod('photo'); setSource('qr'); setScanning(false) }}>
            <RedeemIcon name="photo" /><span><b>사진으로 등록</b><small>카드 앞·뒷면을 촬영해 확인해요.</small></span><small className="redeem-flow-review">검토 필요</small><RedeemIcon name="chevron" />
          </button>
        </div>

        <footer className="redeem-flow-footer">
          <button type="button" className="primary" onClick={continueRegistration}>다음</button>
          <button type="button" className="redeem-flow-help">카드 등록이 어려우신가요?</button>
        </footer>
      </>}

      {step === 2 && <section className="redeem-flow-step-two">
        {selectedMethod === 'qr' && <>
          <div className="redeem-flow-intro redeem-flow-scan-intro">
            <h1>카드 뒷면의 QR 코드를 비춰주세요</h1>
            <p>프레임 안에 코드를 맞추면 자동으로 인식해요.</p>
          </div>
          <div className="redeem-flow-scan-stage">
            <img src={qrScannerImage} alt="보라색 팬폴리오 카드 뒷면의 QR 코드를 스캔하는 예시" />
            {scanning && <video ref={videoRef} autoPlay playsInline muted aria-label="QR 코드 카메라 화면" />}
            <span className="redeem-flow-scan-status"><i />{scanning ? '인식 중' : '스캔 준비'}</span>
          </div>
          <button type="button" className="redeem-flow-camera-start" onClick={() => scanning ? setScanning(false) : startScanning()}>{scanning ? '스캔 중지' : cameraError ? '카메라 권한 다시 요청' : '카메라로 스캔 시작'}</button>
          <div className="redeem-flow-scan-tips" aria-label="QR 코드 촬영 팁">
            <div><RedeemIcon name="scan" /><b>밝은 곳에서</b></div>
            <div><RedeemIcon name="photo" /><b>카드를 평평하게</b></div>
            <div><RedeemIcon name="scan" /><b>프레임에 맞추기</b></div>
          </div>
          <div className="redeem-flow-or"><span>또는</span></div>
          <button type="button" className="redeem-flow-secondary" onClick={() => { setSelectedMethod('photo'); setSource('qr'); setScanning(false); window.requestAnimationFrame(() => photoInputRef.current?.click()) }}><RedeemIcon name="photo" />사진에서 QR 읽기</button>
          <button type="button" className="redeem-flow-secondary" onClick={() => { setSelectedMethod('manual'); setSource('manual'); setScanning(false) }}><RedeemIcon name="code" />인증 코드 직접 입력</button>
          {import.meta.env.DEV && <button type="button" className="redeem-flow-demo" onClick={previewDemoCard}>샘플 카드로 3단계 미리보기</button>}
          <p className="redeem-flow-privacy">촬영 이미지는 기기에 저장되지 않아요.</p>
        </>}

        {selectedMethod === 'manual' && <>
          <div className="redeem-flow-intro redeem-flow-scan-intro"><h1>인증 코드를 입력해 주세요</h1><p>카드 뒷면의 12자리 코드를 입력하면 정보를 확인할 수 있어요.</p></div>
          <div className="redeem-code-field redeem-flow-code-field"><label className="field-label" htmlFor="redeem-code">인증 코드</label><input ref={codeInputRef} id="redeem-code" value={code} onChange={event => { setCode(event.target.value); setSource('manual') }} placeholder="12자리 코드를 입력하세요" autoComplete="off" /><small>코드는 대소문자를 구분하지 않습니다.</small></div>
          <button type="button" className="primary redeem-flow-step-button" disabled={!code.trim()} onClick={() => setStep(3)}>다음</button>
          {import.meta.env.DEV && <button type="button" className="redeem-flow-demo" onClick={previewDemoCard}>샘플 카드로 3단계 미리보기</button>}
        </>}

        {selectedMethod === 'photo' && <>
          <div className="redeem-flow-intro redeem-flow-scan-intro"><h1>카드 사진을 선택해 주세요</h1><p>QR 코드가 선명하게 보이는 카드 뒷면 사진을 사용해 주세요.</p></div>
          <button type="button" className="redeem-flow-photo-picker" onClick={() => photoInputRef.current?.click()}><RedeemIcon name="photo" /><b>{readingImage ? '사진 확인 중...' : '사진 선택하기'}</b></button>
          {import.meta.env.DEV && <button type="button" className="redeem-flow-demo" onClick={previewDemoCard}>샘플 카드로 3단계 미리보기</button>}
        </>}
        <input ref={photoInputRef} className="redeem-flow-file" type="file" accept="image/*" capture="environment" onChange={onQrImageChange} disabled={readingImage} />
      </section>}

      {step === 3 && <section className="redeem-flow-confirm">
        <div className="redeem-flow-intro"><h1>카드 정보를 확인해 주세요</h1><p>등록할 카드가 맞는지 확인한 뒤 컬렉션에 추가해요.</p></div>
        <article className="redeem-flow-confirm-card">
          <div className="redeem-flow-confirm-image"><img src={preview ? preview.card.imageUrl : registrationCardImage} alt={preview ? `${preview.card.memberName ?? ''} ${preview.card.name} 카드` : '카드 정보 확인 중'} /><span>{preview?.card.rarity ?? (isDemo ? 'SR' : '…')}</span></div>
          <div><small>{preview?.card.seasonName ?? (isDemo ? '샘플 카드' : '인증 코드 카드')}</small><h3>{preview ? `${preview.card.memberName ? `${preview.card.memberName} · ` : ''}${preview.card.name}` : isDemo ? '샘플 미리보기 카드' : '카드 정보를 확인하는 중…'}</h3><b>{preview?.card.rarity ?? (isDemo ? 'SR' : '')}</b><p>{isDemo ? '샘플 미리보기 카드' : '입력한 인증 코드로 확인된 카드'}</p></div>
        </article>
        <div className="redeem-flow-confirm-notice"><RedeemIcon name="scan" /><span><b>등록할 카드 정보를 확인해 주세요</b><small>등록하기를 누르면 서버에서 인증번호를 최종 확인한 뒤 컬렉션에 추가해요.</small></span></div>
        <button type="button" className="primary redeem-flow-step-button" disabled={saving || previewLoading || (!isDemo && !preview)} onClick={confirmRegistration}>{saving ? '등록 중...' : previewLoading ? '카드 확인 중...' : '이 카드 등록하기'}</button>
      </section>}

      {message && <p ref={messageRef} className={messageIsError ? 'form-message error-message' : 'form-message'} role={messageIsError ? 'alert' : 'status'}>{message}</p>}
    </div>
  </div>
}

export function RedeemIcon({ name }: { name: 'scan' | 'photo' | 'code' | 'back' | 'chevron' }) {
  const paths = {
    scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8M12 8v8',
    photo: 'M4 6a2 2 0 0 1 2-2h2l1.2-1.5h5.6L16 4h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    code: 'M8 8 4 12l4 4M16 8l4 4-4 4M14 5l-4 14',
    back: 'm15 18-6-6 6-6',
    chevron: 'm9 18 6-6-6-6',
  } as const
  return <span className="redeem-method-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></span>
}
