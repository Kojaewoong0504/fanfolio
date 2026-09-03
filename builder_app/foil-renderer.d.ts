export type FoilRendererSettings = {
  x?: number
  y?: number
  intensity?: number
  spread?: number
  grain?: number
  pattern?: string
  material?: string
  coverage?: string
}

export type FoilSubjectMaskSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap

export type FoilRenderer = {
  draw(settings?: FoilRendererSettings): void
  setSubjectMask(source: FoilSubjectMaskSource | null): void
  ready: Promise<void>
  dispose(): void
}

export function computeCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; width: number; height: number }
export function createFoilRenderer(canvas: HTMLCanvasElement): FoilRenderer
