import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import '../App.css'

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> }
type DetectorConstructor = new (options: { formats: string[] }) => Detector
type RedemptionSource = 'manual' | 'qr'

function normalizeQrValue(rawValue: string): string {
  try {
    const url = new URL(rawValue)
    return url.searchParams.get('code') ?? url.pathname.split('/').filter(Boolean).pop() ?? rawValue
  } catch {
    return rawValue.trim()
  }
}

export function QrRedeemModal({ onClose, onRedeemed }: { onClose: () => void, onRedeemed: (userCardId: string) => void }) {
  const [code, setCode] = useState('')
  const [source, setSource] = useState<RedemptionSource>('manual')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!scanning) return
    let cancelled = false
    const scan = async () => {
      const BarcodeDetector = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector
      if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
        setMessage('이 브라우저에서는 QR 스캔을 지원하지 않습니다. 코드를 직접 입력해 주세요.')
        setScanning(false)
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled || !videoRef.current) { stream.getTracks().forEach(track => track.stop()); return }
        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        const check = async () => {
          if (cancelled || !videoRef.current) return
          const results = await detector.detect(videoRef.current)
          if (results[0]?.rawValue) {
            setCode(normalizeQrValue(results[0].rawValue))
            setSource('qr')
            setMessage('QR 코드가 인식되었습니다.')
            setScanning(false)
            return
          }
          window.setTimeout(() => void check(), 250)
        }
        void check()
      } catch {
        setMessage('카메라를 사용할 수 없습니다. 권한을 확인하거나 코드를 직접 입력해 주세요.')
        setScanning(false)
      }
    }
    void scan()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null }
  }, [scanning])

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

  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}>×</button><h2>카드 등록</h2><p className="muted">카드 패키지의 QR을 스캔하거나<br />코드를 직접 입력하세요.</p>{scanning ? <div className="scanner"><video ref={videoRef} playsInline muted /><button onClick={() => setScanning(false)}>스캔 취소</button></div> : <button className="qr-box" onClick={() => { setMessage('카메라를 준비하고 있습니다.'); setScanning(true) }}><span>QR</span><b>QR 스캔</b><small>카메라로 코드를 비춰주세요.</small></button>}<div className="divider">또는 코드 입력</div><input value={code} onChange={event => { setCode(event.target.value); setSource('manual') }} placeholder="예: NOVA-VALID-01" /><button className="primary" disabled={!code || saving} onClick={() => void redeem()}>{saving ? '등록 중...' : '카드 등록하기'}</button>{message && <p className="form-message error-message">{message}</p>}</div></div>
}
