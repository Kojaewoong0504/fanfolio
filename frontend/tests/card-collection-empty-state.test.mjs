import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('card collection repository falls back to the empty all-pack state when remote packs are unavailable', () => {
  assert.match(
    appSource,
    /group\.packs\.find\(item => item\.id === packId\) \?\? group\.packs\[0\] \?\? allPack/,
  )
})
