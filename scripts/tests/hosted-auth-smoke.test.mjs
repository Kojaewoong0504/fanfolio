import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const testDir = dirname(fileURLToPath(import.meta.url))
const script = resolve(testDir, "..", "hosted-auth-smoke.sh")

const missingCredentials = spawnSync("bash", [script], {
  cwd: resolve(testDir, "../.."),
  env: {
    PATH: process.env.PATH,
    API_URL: "http://127.0.0.1:1",
  },
  encoding: "utf8",
})

assert.equal(missingCredentials.status, 2)
assert.match(missingCredentials.stdout + missingCredentials.stderr, /DEFERRED/)

const source = readFileSync(script, "utf8")
assert.doesNotMatch(source, /playwright/i)
assert.match(source, /ADMIN_EMAIL/)
assert.match(source, /ARTIST_USERNAME/)
assert.match(source, /FAN_EMAIL/)
assert.doesNotMatch(source, /python3 - "\$[A-Z_]+" "\$[A-Z_]+"/)

test("hosted auth smoke exercises all role contracts without exposing credentials", async () => {
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url?.startsWith("/api/auth/")) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ ok: true, data: { accessToken: "test-access-token" } }))
      return
    }
    if (request.method === "GET") {
      const authorization = request.headers.authorization
      if (authorization !== "Bearer test-access-token") {
        response.writeHead(401)
        response.end()
        return
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ ok: true, data: {} }))
      return
    }
    response.writeHead(404)
    response.end()
  })

  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer))
  const address = server.address()
  assert.ok(address && typeof address === "object")

  try {
    const child = spawn("bash", [script], {
      cwd: resolve(testDir, "../.."),
      env: {
        ...process.env,
        API_URL: `http://127.0.0.1:${address.port}`,
        FAN_EMAIL: "fan@example.test",
        FAN_PASSWORD: "fan-password-that-is-not-printed",
        ADMIN_EMAIL: "admin@example.test",
        ADMIN_PASSWORD: "admin-password-that-is-not-printed",
        ARTIST_USERNAME: "artist-test",
        ARTIST_PASSWORD: "artist-password-that-is-not-printed",
        HOSTED_SMOKE_REQUIRED: "1",
        CURL_MAX_TIME: "5",
      },
    })
    const [stdout, stderr, status] = await Promise.all([
      readStream(child.stdout),
      readStream(child.stderr),
      new Promise((resolveChild) => child.on("close", resolveChild)),
    ])
    assert.equal(status, 0, stderr)
    assert.match(stdout, /PASS fan login/)
    assert.match(stdout, /PASS admin context/)
    assert.match(stdout, /PASS artist profile/)
    assert.doesNotMatch(stdout + stderr, /not-printed/)
  } finally {
    await new Promise((resolveServer) => server.close(resolveServer))
  }
})

function readStream(stream) {
  return new Promise((resolveStream, rejectStream) => {
    let output = ""
    stream.setEncoding("utf8")
    stream.on("data", (chunk) => {
      output += chunk
    })
    stream.on("end", () => resolveStream(output))
    stream.on("error", rejectStream)
  })
}
