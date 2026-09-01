import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const script = resolve(process.cwd(), 'scripts/vercel-ignore-preview.sh')

function exitCode(ref) {
  try {
    execFileSync('bash', [script], {
      env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref },
      stdio: 'ignore',
    })
    return 0
  } catch (error) {
    return error.status
  }
}

test('Vercel builds only the main branch and skips preview branches', () => {
  assert.equal(exitCode('main'), 1)
  assert.equal(exitCode('codex/feature-preview'), 0)
})

