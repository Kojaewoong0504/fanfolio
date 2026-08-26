import dreamscapeGroup from './demo/dreamscape/group.png'
import dreamscapeYuna from './demo/dreamscape/yuna.png'
import dreamscapeHarin from './demo/dreamscape/harin.png'
import dreamscapeSena from './demo/dreamscape/sena.png'
import dreamscapeRina from './demo/dreamscape/rina.png'
import dreamscapeEventHero from './demo/dreamscape/event-hero.png'
import dreamscapeCardPack from './demo/dreamscape/card-pack.png'

export const dreamscapeDemoMembers = [
  { id: 'member_yuna', name: '유나', role: '리더 · 보컬', image: dreamscapeYuna },
  { id: 'member_harin', name: '하린', role: '메인 보컬', image: dreamscapeHarin },
  { id: 'member_sena', name: '세나', role: '퍼포먼스 · 보컬', image: dreamscapeSena },
  { id: 'member_rina', name: '리나', role: '래퍼 · 퍼포먼스', image: dreamscapeRina },
] as const

export const dreamscapeDemoAssets = {
  group: dreamscapeGroup,
  hero: dreamscapeEventHero,
  eventHero: dreamscapeEventHero,
  cardPack: dreamscapeCardPack,
  members: dreamscapeDemoMembers,
} as const

export const dreamscapeMemberById = Object.fromEntries(
  dreamscapeDemoMembers.map(member => [member.id, member]),
)
