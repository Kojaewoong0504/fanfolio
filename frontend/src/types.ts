export type Card = {
  id: string
  userCardId?: string
  title: string
  artist: string
  member: string
  image: string
  rarity?: string
  seasonName?: string
  cardType?: string
  signatureText?: string
  issueLimit?: number
  acquisitionSource?: string
  acquiredAt?: string
}
