# Vendored code

## `gavel/`

An unmodified copy of [Gavel](https://github.com/anishathalye/gavel) by Anish
Athalye, at commit `8aa86e7cd6a3171c5aee1e67698543511e784c88` (2025-11-16),
minus its `.git` directory. AGPL-3.0, like this repo (see `gavel/LICENSE.txt`).

Our expo judging (`src/lib/judging`) is a port of it. The copy is here only so
the port can be tested against the original; no app code imports it.

Don't edit files under `gavel/`. To update, replace the directory with a fresh
checkout of the new commit and update the hash above.

## `gavel-oracle/`

Ours, not upstream. `oracle.py` runs the vendored Gavel (its Flask routes,
models and `crowd_bt`) as a reference implementation, driven over
stdin/stdout by `src/tests/gavel-differential.test.ts`. Its docstring lists
what it swaps out (randomness, the clock, argmax tie-breaking, asset builds)
and why.

It runs in Docker (`gavel-oracle/Dockerfile`, Python 3.9 with Gavel's own
`requirements.txt` pins); the test builds the image itself, with `vendor/` as
the build context. To poke at it by hand:

```sh
docker build -t mruhacks-gavel-oracle -f vendor/gavel-oracle/Dockerfile vendor
echo '{"op":"crowd_bt","fn":"update","calls":[[10,1,0,1,0,1]]}' | docker run --rm -i mruhacks-gavel-oracle
```
