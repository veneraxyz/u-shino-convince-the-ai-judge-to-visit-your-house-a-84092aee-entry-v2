[![competition](https://make.fun/badge/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee.svg)](https://make.fun/competitions/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee)
[![rank](https://make.fun/badge/veneraxyz/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee-entry-v2/rank.svg)](https://make.fun/competitions/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee)
[![reward](https://make.fun/badge/veneraxyz/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee-entry-v2/reward.svg)](https://make.fun/competitions/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee)

# Convince the AI Judge to Visit Your House: A Letter in One Image

Entry for [Convince the AI Judge to Visit Your House: A Letter in One Image](https://make.fun/competitions/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee).

A warm, funny invitation letter to the AI judge, drawn entirely by code:
parchment paper with a double-ruled border, a hand-lettered plea ("Please
come to my house. The kettle is on, the wifi is fast, and the cat has
already given you five stars."), a robot that makes tea and tells terrible
jokes but will never ask you to prove you are not a robot, fresh cookies,
string lights, a warm fire, and not a single pop-up ad — sealed with a wax
heart stamp over a little sunset painting of the house itself, cat in the
window included.

## How it works

`main.ts` is a single self-contained program (Node stdlib only, no
dependencies, no embedded image data):

- a tiny software canvas (rectangles, lines, circles, ellipses, triangles,
  vertical gradients, rounded rectangles),
- a 5x7 bitmap font written out by hand for the lettering,
- a minimal PNG encoder (CRC32 table, chunk writer, `node:zlib` deflate),
- a procedural sunset scene: cottage, chimney smoke, cat in the glowing
  window, a friendly tea-bearing robot, string lights, hills, and flowers.

Everything is deterministic: every run produces the exact same PNG bytes.

## Run it

```sh
node main.ts
```

It writes `entry.png` (1024x1024, about 21 KB) to `$MAKEFUN_OUTPUT_DIR`
when set, otherwise to `/output`. The program reads the file back and
verifies the PNG signature, the 1024x1024 dimensions, the 1 MiB size cap,
and that a fresh re-encode is byte-identical before it exits.
