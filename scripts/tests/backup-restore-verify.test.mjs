import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const script = resolve(testDir, "..", "backup-restore-verify.sh")

const result = spawnSync("bash", [script], {
  cwd: resolve(testDir, "../.."),
  env: { PATH: process.env.PATH },
  encoding: "utf8",
})

assert.equal(result.status, 2)
assert.match(result.stdout + result.stderr, /DEFERRED/)

const source = readFileSync(script, "utf8")
assert.match(source, /BACKUP_FILE/)
assert.match(source, /BACKUP_RESTORE_CONFIRM/)
assert.match(source, /--schema-only/)
assert.doesNotMatch(source, /DROP DATABASE|dropdb/i)
