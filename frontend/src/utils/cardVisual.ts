import type { SyntheticEvent } from 'react'
import cardYuna from '../assets/card-yuna-lavender.jpg'
import cardMinho from '../assets/card-minho-midnight.jpg'
import cardJay from '../assets/card-jay-rosegold.jpg'
import cardPlaceholder from '../assets/card-example.svg'

export function demoCardImage(imageUrl: string, seed = ''): string {
  // A released card must use its stored asset URL. The placeholder is only
  // used for legacy records that still point at the old hero.png demo asset.
  // Legacy demo records may point at the generic silhouette SVG as well as the
  // old hero image. Treat both as placeholders so member-specific artwork wins.
  if (imageUrl && !imageUrl.includes('hero.png') && !imageUrl.includes('card-example')) return imageUrl
  if (!seed.startsWith('member:') && !seed.startsWith('artist:')) return cardPlaceholder
  if (seed.includes('유나') || seed.toLowerCase().includes('yuna')) return cardYuna
  if (seed.includes('민호') || seed.toLowerCase().includes('minho')) return cardMinho
  if (seed.includes('제이') || seed.toLowerCase().includes('jay')) return cardJay
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
  // Never replace a missing production card with an unrelated stock photo.
  event.currentTarget.src = seed.startsWith('member:') || seed.startsWith('artist:')
    ? demoCardImage('hero.png', seed)
    : cardPlaceholder
}
