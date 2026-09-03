export const EFFECT_CATALOG = [
  {
    id: 'aurora-wave',
    name: '크리스털 포일',
    description: '시안 결정면과 오로라 빛이 겹치는 대표 포일',
    number: 1,
  },
  {
    id: 'satin-pearl',
    name: '새틴 펄',
    description: '부드러운 새틴 결 위로 은은한 진주광이 흐르는 표면',
    number: 2,
  },
  {
    id: 'gold-signature',
    name: '골드 시그니처',
    description: '서명 영역을 금빛 하이라이트처럼 강조하는 효과',
    number: 3,
  },
  {
    id: 'spectrum-edge',
    name: '스펙트럼 엣지',
    description: '카드 가장자리에 각도별 스펙트럼 반사를 더하는 효과',
    number: 4,
  },
  {
    id: 'constellation',
    name: '별자리 글리터',
    description: '작은 별점과 선명한 반짝임이 점층적으로 나타나는 글리터',
    number: 5,
  },
  {
    id: 'glass-caustics',
    name: '유리빛 굴절',
    description: '유리 표면을 통과한 빛처럼 얇은 굴절선을 겹치는 효과',
    number: 6,
  },
  {
    id: 'liquid-silver',
    name: '리퀴드 실버',
    description: '흐르는 은빛 금속 광택이 사진 위를 따라 움직이는 표면',
    number: 7,
  },
  {
    id: 'laser-engraving',
    name: '레이저 인그레이빙',
    description: '미세한 각인선과 날카로운 레이저 반사를 얹는 효과',
    number: 8,
  },
  {
    id: 'cinema-flare',
    name: '시네마 플레어',
    description: '렌즈 플레어 같은 긴 빛줄기로 무대감을 높이는 효과',
    number: 9,
  },
  {
    id: 'blossom-depth',
    name: '블로썸 뎁스',
    description: '꽃잎처럼 퍼지는 레이어 광택으로 깊이를 주는 효과',
    number: 10,
  },
  {
    id: 'light-signature',
    name: '라이트 시그니처',
    description: '사인처럼 남는 얇은 빛의 궤적을 더하는 효과',
    number: 11,
  },
  {
    id: 'diamond-cut',
    name: '다이아몬드 컷',
    description: '다각 컷팅면처럼 선명한 고광택 반사를 만드는 효과',
    number: 12,
  },
]

export const LEGACY_FOIL_PATTERN_IDS = [
  'aurora-wave',
  'prism',
  'cracked-ice',
  'micro-star',
  'liquid-chrome',
  'glass-flare',
]

export const ALL_FOIL_PATTERN_IDS = [
  ...EFFECT_CATALOG.map((effect) => effect.id),
  ...LEGACY_FOIL_PATTERN_IDS.filter(
    (id) => !EFFECT_CATALOG.some((effect) => effect.id === id),
  ),
]
