import type { SyntheticEvent } from 'react'
import cardYuna from '../assets/card-yuna-lavender.jpg'
import cardMinho from '../assets/card-minho-midnight.jpg'
import cardJay from '../assets/card-jay-rosegold.jpg'

export function demoCardImage(imageUrl: string, seed = ''): string {
  // Catalog responses may omit an image while an asset is still being
  // prepared. Keep the UI visual instead of rendering an empty/broken img.
  if (imageUrl && !imageUrl.includes('hero.png')) return imageUrl
  const variants = [cardYuna, cardMinho, cardJay]
  const hash = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0)
  return variants[hash % variants.length]
}

export function demoMemberImage(memberId: string): string {
  return demoCardImage('hero.png', `member:${memberId}`)
}

export function keepCardVisual(event: SyntheticEvent<HTMLImageElement>, seed: string): void {
  if (event.currentTarget.dataset.fallbackApplied === 'true') return
  event.currentTarget.dataset.fallbackApplied = 'true'
  event.currentTarget.src = demoCardImage('hero.png', seed)
}
