import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const effectsSource = fs.readFileSync(new URL('../src/utils/cardEffects.ts', import.meta.url), 'utf8')
const collectibleSource = fs.readFileSync(new URL('../src/components/InteractiveCollectibleCard.tsx', import.meta.url), 'utf8')
const builderSource = fs.readFileSync(new URL('../../builder_app/app.js', import.meta.url), 'utf8')

test('studio preset vocabulary is normalized into existing collectible materials', () => {
  assert.match(effectsSource, /configuredPreset/)
  assert.match(effectsSource, /hologram: 'prism'/)
  assert.match(effectsSource, /particles: 'micro-star'/)
})

test('back face keeps tilt interaction without a front light surface', () => {
  assert.match(collectibleSource, /visibleSide === 'back' \|\| effects\.front\.interaction !== 'static'/)
  assert.match(collectibleSource, /if \(visibleSide === 'front'\) \{/)
  assert.match(collectibleSource, /const canTilt = visibleSide === 'back' \|\|/)
})

test('artist studio submits the saved effect snapshot for review', () => {
  assert.match(builderSource, /\/effect-versions`/)
  assert.match(builderSource, /designConfig: card\.designConfig \|\| \{\}/)
  assert.match(builderSource, /effectVersionId.*submit-review/)
})
