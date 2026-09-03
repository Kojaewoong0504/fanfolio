import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EFFECT_CATALOG } from '../effect-catalog.js'
import { FOIL_PATTERNS, computeCoverCrop, normalizeFoilSettings } from '../foil-renderer.js'

test('renderer exposes the twelve approved materials in catalog order', () => {
  assert.deepEqual(FOIL_PATTERNS, EFFECT_CATALOG.map(e => e.id))
})
test('invalid input cannot poison GPU uniforms and legacy effects still resolve', () => {
  const settings = normalizeFoilSettings({x: Infinity,y:-5,intensity:NaN,spread:8,grain:-1,pattern:'liquid-chrome'})
  assert.equal(settings.x,.5)
  assert.equal(settings.y,0)
  assert.equal(settings.intensity,.72)
  assert.equal(settings.spread,1)
  assert.equal(settings.grain,0)
  assert.equal(settings.pattern,'liquid-chrome')
  assert.equal(normalizeFoilSettings({pattern:'invalid'}).pattern,'aurora-wave')
})
test('all twelve material modes have an explicit distinct shader branch', () => {
  const shader=readFileSync(new URL('../atelier-shader.js',import.meta.url),'utf8')
  for(const effect of EFFECT_CATALOG.slice(1))assert.ok(shader.includes(`// ${effect.id}`),effect.id)
})
test('studio only replaces fallback after material readiness and hides failed canvases', () => {
  const source=readFileSync(new URL('../foil-renderer.js',import.meta.url),'utf8')
  assert.match(source,/canvas\.style\.visibility='hidden'/)
  assert.match(source,/renderer\.ready\.then\([\s\S]*?card\.classList\.add\('webgl2-ready'\)/)
  assert.match(source,/card\.classList\.remove\('webgl2-ready'\)/)
})
test('renderer API exposes nullable subject mask setter for image and canvas sources', () => {
  const types=readFileSync(new URL('../foil-renderer.d.ts',import.meta.url),'utf8')
  assert.match(types,/setSubjectMask\(source:\s*FoilSubjectMaskSource\s*\|\s*null\):\s*void/)
  assert.match(types,/HTMLImageElement/)
  assert.match(types,/HTMLCanvasElement/)
})
test('background coverage fails closed without a real subject mask and samples inverse luminance', () => {
  const source=readFileSync(new URL('../foil-renderer.js',import.meta.url),'utf8')
  assert.match(source,/uniform sampler2D subjectMask/)
  assert.match(source,/hasSubjectMask/)
  assert.match(source,/1\.-dot\(texture\(subjectMask,maskUv\)\.rgb,vec3\(\.299,.587,.114\)\)/)
  assert.match(source,/coverage>\.5&&coverage<1\.5[\s\S]*?return hasSubjectMask>\.5\?clamp/)
  assert.match(source,/upload\(null,12,'subjectMask'\)/)
  assert.match(source,/gl\.TEXTURE0\+12/)
  assert.doesNotMatch(source,/vec2 p=\(uv-vec2\(\.5,\.49\)\)\/vec2\(\.32,\.48\)/)
})
test('subject mask cover crop matches object-fit cover centered in card space', () => {
  assert.deepEqual(computeCoverCrop(1200, 800, 300, 450), {
    x: 0.2777777777777778,
    y: 0,
    width: 0.4444444444444444,
    height: 1,
  })
  assert.deepEqual(computeCoverCrop(600, 1200, 300, 300), {
    x: 0,
    y: 0.25,
    width: 1,
    height: 0.5,
  })
  assert.deepEqual(computeCoverCrop(600, 900, 300, 450), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  })
})
