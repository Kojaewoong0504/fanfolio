import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { apiFetch } from '../api/client'
import '../App.css'
import './QrRedeemModal.css'
import { normalizeQrValue } from './qrUtils'

type RedemptionSource = 'manual' | 'qr'

function isRedemptionErrorMessage(message: string): boolean {
  return ['실패', '찾을 수', '찾지 못', '비활성화', '사용할 수', '이미 사용', '만료된', '만료되었습니다', '카메라를 사용할 수 없습니다'].some(keyword => message.includes(keyword))
}

export function QrRedeemModal({ onClose, onRedeemed }: { onClose: () => void, onRedeemed: (userCardId: string) => void }) {
  const [code, setCode] = useState('')
  // QR is the primary digital-card path. Keep manual entry behind an explicit
  // choice so the first modal view is about selecting a digital source, not
  // staring at a generic text field.
  const [source, setSource] = useState<RedemptionSource>('qr')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [readingImage, setReadingImage] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerControlsRef = useRef<IScannerControls | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLParagraphElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
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
      try {
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
          },
        )
        if (cancelled) controls.stop()
        else scannerControlsRef.current = controls
      } catch {
        setMessage('카메라를 사용할 수 없습니다. 권한을 확인하거나 코드를 직접 입력해 주세요.')
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
      const result = await apiFetch<{ ok: true, data: { userCardId: string } }>('/redemptions', { method: 'POST', body: JSON.stringify({ code, source }) })
      onRedeemed(result.data.userCardId)
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
    if (source !== 'manual' || scanning) return
    const frame = window.requestAnimationFrame(() => codeInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [scanning, source])

  useEffect(() => {
    if (!message || !isRedemptionErrorMessage(message)) return
    const frame = window.requestAnimationFrame(() => messageRef.current?.scrollIntoView({ block: 'nearest' }))
    return () => window.cancelAnimationFrame(frame)
  }, [message])

  const messageIsError = isRedemptionErrorMessage(message)
  return <div className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal redeem-modal" role="dialog" aria-modal="true" aria-labelledby="redeem-title"><div className="redeem-modal-header"><div><p className="eyebrow">디지털 카드</p><h2 id="redeem-title">카드 등록</h2></div><button ref={closeButtonRef} className="modal-close" aria-label="카드 등록 닫기" onClick={onClose}>×</button></div><p className="muted">카드 패키지에서 받은 정보를 선택해 주세요.</p><div className="redeem-methods" role="group" aria-label="카드 등록 방법"><div className="redeem-method-heading"><b>등록 방법</b><span>원하는 방법을 선택하세요</span></div>{scanning ? <div className="scanner redeem-scanner"><video ref={videoRef} playsInline muted /><button type="button" onClick={() => { setScanning(false); setMessage('') }}>스캔 취소</button></div> : <button type="button" className={source === 'qr' ? 'redeem-method qr-box selected' : 'redeem-method qr-box'} onClick={() => { setCode(''); setSource('qr'); setMessage('카메라를 준비하고 있습니다.'); setScanning(true) }}><RedeemIcon name="scan" /><span><b>QR 스캔</b><small>카메라로 카드 패키지의 QR을 비춰요.</small></span><strong aria-hidden="true">›</strong></button>}<label className="redeem-method qr-photo-upload"><RedeemIcon name="photo" /><span><b>사진으로 QR 읽기</b><small>{readingImage ? '사진을 확인하고 있어요.' : '저장된 QR 사진을 선택해요.'}</small></span><strong aria-hidden="true">›</strong><input type="file" accept="image/*" capture="environment" onChange={onQrImageChange} disabled={readingImage} /></label><button type="button" className={source === 'manual' ? 'redeem-method manual-method selected' : 'redeem-method manual-method'} onClick={() => { setSource('manual'); setMessage('') }}><RedeemIcon name="code" /><span><b>카드 코드 입력</b><small>패키지에 적힌 코드를 직접 입력해요.</small></span><strong aria-hidden="true">›</strong></button></div>{source === 'manual' && !scanning && <div className="redeem-code-field"><label className="field-label" htmlFor="redeem-code">카드 코드</label><input ref={codeInputRef} id="redeem-code" value={code} onChange={event => { setCode(event.target.value); setSource('manual') }} placeholder="예: NOVA-VALID-01" autoComplete="off" /><small>코드는 대소문자를 구분하지 않습니다.</small></div>}{code && !scanning && !readingImage && <button type="button" className="primary" disabled={saving} onClick={() => void redeem()}>{saving ? '등록 중...' : '카드 등록하기'}</button>}{message && <p ref={messageRef} className={messageIsError ? 'form-message error-message' : 'form-message'} role={messageIsError ? 'alert' : 'status'}>{message}</p>}</div></div>
}

function RedeemIcon({ name }: { name: 'scan' | 'photo' | 'code' }) {
  const paths = {
    scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8M12 8v8',
    photo: 'M4 6a2 2 0 0 1 2-2h2l1.2-1.5h5.6L16 4h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    code: 'M8 8 4 12l4 4M16 8l4 4-4 4M14 5l-4 14',
  } as const
  return <span className="redeem-method-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></span>
}
