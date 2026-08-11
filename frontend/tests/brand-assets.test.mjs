import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function pngSize(relativePath) {
  const bytes = await readFile(new URL(relativePath, import.meta.url));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test("fan app ships full-size install and browser icon assets", async () => {
  assert.deepEqual(await pngSize("../public/fanfolio-app-icon.png"), {
    width: 1024,
    height: 1024,
  });
  assert.deepEqual(await pngSize("../public/fanfolio-app-icon-512.png"), {
    width: 512,
    height: 512,
  });
  assert.deepEqual(await pngSize("../public/fanfolio-app-icon-192.png"), {
    width: 192,
    height: 192,
  });
  assert.deepEqual(await pngSize("../public/apple-touch-icon.png"), {
    width: 180,
    height: 180,
  });
  assert.deepEqual(await pngSize("../public/favicon.png"), {
    width: 64,
    height: 64,
  });
});

test("fan app declares its generated bitmap icon set", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(
    await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  );

  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.match(html, /href="\/favicon\.png"/);
  assert.doesNotMatch(html, /favicon\.svg/);
  assert.deepEqual(
    manifest.icons.map(({ src, sizes }) => ({ src, sizes })),
    [
      { src: "/fanfolio-app-icon-192.png", sizes: "192x192" },
      { src: "/fanfolio-app-icon-512.png", sizes: "512x512" },
    ],
  );
});
