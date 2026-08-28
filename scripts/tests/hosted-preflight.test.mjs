import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const testDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(testDir, "..", "hosted-preflight.sh"), "utf8")

test("hosted preflight validates API payloads and app mount points", () => {
  assert.match(source, /check_api_health\s*\(\)/)
  assert.match(source, /\"ok\"[^\n]*true/)
  assert.match(source, /check_app\s*\(\)/)
  assert.match(source, /HTML mount point is missing/)
  assert.match(source, /ADMIN_URL=.*fanfolio-admin-one\.vercel\.app/)
})
