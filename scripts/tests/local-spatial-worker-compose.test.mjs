import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const composePath = resolve(root, "docker-compose.spatial-worker.local.yml");
const envPath = resolve(root, "backend/.env.spatial-local.example");
const runnerPath = resolve(root, "scripts/run-local-spatial-worker.sh");
const read = (path) => readFileSync(path, "utf8");

test("local spatial worker overlay exposes the real worker on port 8080", () => {
  const compose = read(composePath);
  assert.match(compose, /spatial-worker:/);
  assert.match(compose, /dockerfile:\s*spatial_worker\/Dockerfile/);
  assert.match(compose, /"8080:8080"/);
  assert.match(compose, /SPATIAL_SCENE_WORKER_TOKEN:\s*local-spatial-worker-token/);
  assert.match(compose, /localhost:8080\/health/);
});

test("local spatial environment selects the asynchronous real worker path", () => {
  const env = read(envPath);
  assert.match(env, /^SPATIAL_SCENE_PROVIDER=http$/m);
  assert.match(env, /^SPATIAL_SCENE_AI_URL=http:\/\/localhost:8080\/generate$/m);
  assert.match(env, /^SPATIAL_SCENE_AI_TOKEN=local-spatial-worker-token$/m);
  assert.match(env, /^TASK_QUEUE_MODE=inline$/m);
  assert.match(env, /^DATABASE_URL=sqlite:\/\/\/\.\/fanfolio\.db$/m);
});

test("container worker keeps the standard dependency set for Linux builds", () => {
  const dockerfile = read(resolve(root, "spatial_worker/Dockerfile"));
  assert.match(dockerfile, /pip install --no-cache-dir -r \/app\/requirements\.txt/);
  assert.doesNotMatch(dockerfile, /requirements-without-torch/);
});

test("Mac local testing has a native worker runner", () => {
  const runner = read(runnerPath);
  assert.match(runner, /-m venv/);
  assert.match(runner, /spatial_worker\/requirements\.txt/);
  assert.match(runner, /SPATIAL_SCENE_WORKER_TOKEN/);
  assert.match(runner, /spatial_worker\.app:app/);
});
