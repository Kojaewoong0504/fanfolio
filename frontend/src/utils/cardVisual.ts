import type { SyntheticEvent } from 'react'
import cardExample from '../assets/card-example.svg'
import cardExampleBlue from '../assets/card-example-blue.svg'
import cardExamplePink from '../assets/card-example-pink.svg'

export function demoCardImage(imageUrl: string, seed = ''): string {
  if (!imageUrl.includes('hero.png')) return imageUrl
  const variants = [cardExample, cardExampleBlue, cardExamplePink]
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
