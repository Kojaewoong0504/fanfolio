import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
)
const compose = readFileSync(
  resolve(process.cwd(), "docker-compose.stack.yml"),
  "utf8",
)

test("CI authenticates against its seeded test stack instead of hosted credentials", () => {
  assert.doesNotMatch(workflow, /^  hosted-auth-smoke:/m)
  assert.match(workflow, /Verify isolated authentication contracts/)
  assert.match(workflow, /tests\/contract\/test_auth\.py/)
  assert.match(compose, /APP_ENV: test/)
  assert.doesNotMatch(workflow, /FAN_EMAIL:|ADMIN_EMAIL:|ARTIST_USERNAME:/)
})
