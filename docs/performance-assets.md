# Texture optimization results

The original planet texture set was 738,318 bytes. The accepted set is
627,188 bytes: **111,130 bytes (15.1%) less**, with the same URLs and dimensions.
The four existing texture preloads therefore remain valid without markup changes.

Nine opaque WebP textures were re-encoded at quality 75, effort 6, accepting only
smaller files. Ring transparency is unchanged. The original Moon, Mercury and
cloud textures were retained byte-for-byte after independent visual QA.

## Why the proposed half-resolution textures were rejected

The source plan assumed Moon and Mercury are always tiny. The current camera can
focus and manually zoom these bodies. Native-resolution comparison sheets showed
visible crater-detail loss after downscaling to 512×256. Full-resolution quality
85 candidates looked close but saved only 5,044 bytes together, so retaining the
originals was the safer choice.

The cloud texture has **no alpha channel**: its green channel drives `alphaMap`,
and the same image also supplies the color map. The quality-75 candidate changed
that opacity channel by 2.515/255 on average (maximum 26/255). Keeping the original
costs just 17,520 bytes compared with that candidate and avoids changing either.

## Verification and limitations

- Original/optimized contact sheets were independently inspected at small sizes
  and native-resolution detail crops. Moon/Mercury candidates were also inspected
  at 2× enlargement.
- Other inspected textures were visually close at small display sizes, with local
  luma SSIM approximately 0.992–0.999; this is a custom comparison metric, not a
  guarantee of perceptual identity on every GPU, display or zoom level.
- `node --test tests/textures.test.mjs` checks decoding, retained focus resolution,
  aggregate download budget, ring alpha and golden hashes of the original decoded
  cloud/ring opacity channels.
- No texture loader, color space, material, filtering, anisotropy, or scene framing
  behavior was changed. KTX2 remains optional future work, not part of this patch.
