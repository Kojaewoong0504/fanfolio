import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const previewPath = new URL('../public/spatial-scene-preview-v4.html', import.meta.url)

test('spatial preview preserves the original 2:3 framing without hidden zoom', async () => {
  const html = await readFile(previewPath, 'utf8')

  assert.match(html, /aspect-ratio:\s*2\s*\/\s*3/)
  assert.doesNotMatch(html, /#background[^}]*transform:\s*scale\(/)
  assert.match(html, /const\s+zoom\s*=\s*1\s*;/)
  assert.match(html, /원본 프레이밍 100%/)
})

test('spatial preview exposes identity-safe camera motion strengths and defaults to balanced', async () => {
  const html = await readFile(previewPath, 'utf8')

  assert.match(html, /data-strength="subtle"/)
  assert.match(html, /data-strength="balanced"[^>]*aria-pressed="true"/)
  assert.match(html, /data-strength="strong"/)
  assert.match(html, /balanced:\s*\{\s*yaw:\s*4,\s*pitch:\s*3,\s*travel:\s*0\.105,\s*relief:\s*0\.038/)
})

test('2D comparison switches the renderer to the unmodified source texture', async () => {
  const html = await readFile(previewPath, 'utf8')

  assert.match(html, /drawOriginalPhoto\(\)/)
  assert.match(html, /if\s*\(compare2d\)\s*\{\s*drawOriginalPhoto\(\)/)
})

test('spatial mode uses a separately reconstructed background plate', async () => {
  const html = await readFile(previewPath, 'utf8')

  assert.match(html, /backgroundPlate\.src\s*=\s*'\/spatial\/card-minho-background\.png'/)
  assert.match(html, /backgroundTexture:\s*makeTexture\(backgroundPlate\)/)
  assert.match(html, /texture:\s*resources\.backgroundTexture/)
  assert.match(html, /depth\.src\s*=\s*'\/spatial\/card-minho-depth\.png'/)
  assert.match(html, /mask\.src\s*=\s*'\/spatial\/card-minho-mask-photo-derived\.png'/)
})

test('spatial mode renders indexed depth geometry through one perspective camera', async () => {
  const html = await readFile(previewPath, 'utf8')

  assert.match(html, /const\s+GRID_X\s*=\s*72/)
  assert.match(html, /const\s+GRID_Y\s*=\s*108/)
  assert.match(html, /function\s+createDepthMesh/)
  assert.match(html, /uniform\s+mat4\s+viewProjection/)
  assert.match(html, /gl\.drawElements\(gl\.TRIANGLES/)
  assert.match(html, /perspectiveMatrix/)
  assert.match(html, /lookAtMatrix/)
})

test('spatial mode does not bend identity with fragment-space UV displacement', async () => {
  const html = await readFile(previewPath, 'utf8')

  assert.doesNotMatch(html, /vec2\s+projected\s*=\s*uv/)
  assert.doesNotMatch(html, /vec2\s+q\s*=\s*clamp\(projected/)
  assert.doesNotMatch(html, /warpAmount/)
  assert.match(html, /IDENTITY_SAFE_RELIEF/)
  assert.match(html, /sampleSmoothedDepth/)
})

test('foreground mask preserves the photographed shoulder contour instead of using a generic oval', async () => {
  const html = await readFile(previewPath, 'utf8')

  assert.match(html, /mask\.src\s*=\s*'\/spatial\/card-minho-mask-photo-derived\.png'/)
  assert.doesNotMatch(html, /인물 알파 마스크/)
  assert.match(html, /원본 사진 기반 공간 렌더링 비교/)
})

test('second portrait has independent source assets and discloses proxy depth', async () => {
  const html = await readFile(previewPath, 'utf8')
  assert.match(html, /data-scene="minho"/)
  assert.match(html, /data-scene="yuna"/)
  for (const asset of ['card-yuna-lavender.jpg', 'card-yuna-background.png', 'card-yuna-depth-proxy.png', 'card-yuna-mask-photo-derived.png']) {
    assert.ok(html.includes(asset), asset)
  }
  assert.match(html, /실루엣 깊이 프록시/)
  assert.match(html, /실제 단안 깊이 추론은 미적용/)
})

test('background has guard coverage for the maximum camera travel', async () => {
  const html = await readFile(previewPath, 'utf8')
  const overscan = Number(html.match(/BACKGROUND_OVERSCAN\s*=\s*([\d.]+)/)?.[1])
  assert.ok(overscan >= 1.32, 'reconstructed background must cover the card at both extreme poses')
})
