import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type {
  CardMaterial,
  FoilCoverage,
  FoilPattern,
} from '../api/client'

type FoilRendererSettings = {
  x: number
  y: number
  intensity: number
  spread: number
  grain: number
  pattern: FoilPattern
  material: CardMaterial
  coverage: FoilCoverage
}

type FoilRenderer = {
  draw(settings?: Partial<FoilRendererSettings>): void
  ready: Promise<void>
  dispose(): void
}

type FoilRendererModule = {
  createFoilRenderer(canvas: HTMLCanvasElement): FoilRenderer
}

export type FoilSurfaceCanvasProps = Omit<FoilRendererSettings, 'x' | 'y'> & {
  pointer: { x: number, y: number }
  onReadyChange?: (ready: boolean) => void
}

const canvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  width: '100%',
  height: '100%',
  borderRadius: 'inherit',
  pointerEvents: 'none',
}

export function FoilSurfaceCanvas({
  pointer,
  intensity,
  spread,
  grain,
  pattern,
  material,
  coverage,
  onReadyChange,
}: FoilSurfaceCanvasProps) {
  const [webglReady, setWebglReady] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<FoilRenderer | null>(null)
  const settingsRef = useRef<FoilRendererSettings>({
    x: pointer.x,
    y: pointer.y,
    intensity,
    spread,
    grain,
    pattern,
    material,
    coverage,
  })

  useEffect(() => {
    settingsRef.current = {
      x: pointer.x,
      y: pointer.y,
      intensity,
      spread,
      grain,
      pattern,
      material,
      coverage,
    }
    rendererRef.current?.draw(settingsRef.current)
  }, [coverage, grain, intensity, material, pattern, pointer.x, pointer.y, spread])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let mounted = true
    let renderer: FoilRenderer | null = null
    let resizeObserver: ResizeObserver | null = null
    const markReady = (ready: boolean) => {
      if (!mounted) return
      setWebglReady(ready)
      if (onReadyChange) onReadyChange(ready)
    }
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      markReady(false)
      rendererRef.current = null
      if (renderer) renderer.dispose()
      renderer = null
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)
    if (onReadyChange) onReadyChange(false)

    import('../../../builder_app/foil-renderer.js')
      .then((module: FoilRendererModule) => {
        if (!mounted) return
        const currentRenderer = module.createFoilRenderer(canvas)
        renderer = currentRenderer
        rendererRef.current = currentRenderer
        currentRenderer.draw(settingsRef.current)
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            rendererRef.current?.draw(settingsRef.current)
          })
          resizeObserver.observe(canvas)
        }
        currentRenderer.ready
          .then(() => {
            if (!mounted || rendererRef.current !== currentRenderer) return
            markReady(true)
            currentRenderer.draw(settingsRef.current)
          })
          .catch(() => {
            if (!mounted || rendererRef.current !== currentRenderer) return
            markReady(false)
            rendererRef.current = null
            currentRenderer.dispose()
          })
      })
      .catch(() => {
        markReady(false)
      })

    return () => {
      mounted = false
      if (onReadyChange) onReadyChange(false)
      resizeObserver?.disconnect()
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      rendererRef.current = null
      if (renderer) renderer.dispose()
    }
  }, [onReadyChange])

  return <canvas ref={canvasRef} aria-hidden="true" data-webgl-effect style={{ ...canvasStyle, visibility: webglReady ? 'visible' : 'hidden' }} />
}
