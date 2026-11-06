import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

const directory = new URL("../public/textures/planets/", import.meta.url);

test("focusable small-body textures retain close-up resolution", async () => {
  for (const name of ["moon", "mercury"]) {
    const { info } = await sharp(await readFile(new URL(`${name}.webp`, directory)))
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1024);
    assert.equal(info.height, 512);
  }
});

test("planet texture downloads stay below 650 KB and retain the ring alpha", async () => {
  let bytes = 0;
  for (const name of await readdir(directory)) {
    if (name.endsWith(".webp")) bytes += (await stat(new URL(name, directory))).size;
  }
  assert.ok(bytes < 650_000, `${bytes} bytes exceeds the texture budget`);
  const ring = await sharp(await readFile(new URL("saturn_ring.webp", directory))).metadata();
  assert.equal(ring.hasAlpha, true);
});

test("cloud and ring opacity channels match the original material maps exactly", async () => {
  // Golden hashes from the original decoded opacity channels, not encoded files.
  for (const [name, channel, hash] of [
    ["earth_clouds", 1, "c1f122ff4478dbaab2441bd7c1383f1c10d2dda75446b7011b755a214e28b71f"],
    ["saturn_ring", 3, "fca99f3992a1b461d0a51de84859a82b5dff0a9a2b21f456567f39ab76ffc5be"]
  ]) {
    const pixels = await sharp(await readFile(new URL(`${name}.webp`, directory)))
      .extractChannel(channel)
      .raw()
      .toBuffer();
    assert.equal(createHash("sha256").update(pixels).digest("hex"), hash, name);
  }
});
