import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { apiFetch } from '../api/client'
import '../App.css'
import './QrRedeemModal.css'
import { normalizeQrValue } from './qrUtils'

type RedemptionSource = 'manual' | 'qr'

export function QrRedeemModal({ onClose, onRedeemed }: { onClose: () => void, onRedeemed: (userCardId: string) => void }) {
  const [code, setCode] = useState('')
  const [source, setSource] = useState<RedemptionSource>('manual')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [readingImage, setReadingImage] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerControlsRef = useRef<IScannerControls | null>(null)

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
    setReadingImage(true)
    setMessage('사진에서 QR 코드를 찾는 중입니다.')
    const imageUrl = URL.createObjectURL(file)
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(imageUrl)
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

  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}>×</button><h2>카드 등록</h2><p className="muted">카드 패키지의 QR을 스캔하거나<br />코드를 직접 입력하세요.</p>{scanning ? <div className="scanner"><video ref={videoRef} playsInline muted /><button onClick={() => setScanning(false)}>스캔 취소</button></div> : <button className="qr-box" onClick={() => { setMessage('카메라를 준비하고 있습니다.'); setScanning(true) }}><span>QR</span><b>QR 스캔</b><small>카메라로 코드를 비춰주세요.</small></button>}<label className="qr-photo-upload">📷 사진으로 QR 읽기<input type="file" accept="image/*" capture="environment" onChange={onQrImageChange} disabled={readingImage} /></label><div className="divider">또는 코드 입력</div><input value={code} onChange={event => { setCode(event.target.value); setSource('manual') }} placeholder="예: NOVA-VALID-01" /><button className="primary" disabled={!code || saving || readingImage} onClick={() => void redeem()}>{saving ? '등록 중...' : '카드 등록하기'}</button>{message && <p className="form-message">{message}</p>}</div></div>
}
