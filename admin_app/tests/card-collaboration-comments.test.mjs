import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

test('admin card review exposes card-scoped collaboration comments', () => {
  assert.match(source, /function cardCollaborationCommentsPanel\(/)
  assert.match(source, /협업 코멘트/)
  assert.match(source, /\/admin\/cards\/\$\{encodeURIComponent\(cardId\)\}\/comments/)
  assert.match(source, /loadCardCollaborationComments\(cardId\)/)
  assert.match(source, /cardCollaborationCommentsPanel\(card\)/)
})
