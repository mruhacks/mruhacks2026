# Vendored code

## `gavel.tar.gz`

An unmodified copy of [Gavel](https://github.com/anishathalye/gavel) by Anish
Athalye, at commit `8aa86e7cd6a3171c5aee1e67698543511e784c88` (2025-11-16),
minus its `.git` directory, packed as a tarball with a top-level `gavel/`
directory. AGPL-3.0, like this repo (see `gavel/LICENSE.txt` inside it).

Our expo judging (`src/lib/judging`) is a port of it. The copy is here only so
the port can be tested against the original; no app code imports it. It's a
tarball so upstream's ~60 files don't swamp diffs; the oracle's Dockerfile
unpacks it. To browse it: `tar -xzf vendor/gavel.tar.gz -C /tmp`.

Don't edit its contents. To update, rebuild it from a fresh checkout of the
new commit (deterministically, so an unchanged tree gives an identical
archive) and update the hash above:

```sh
git clone https://github.com/anishathalye/gavel /tmp/gavel
git -C /tmp/gavel checkout <commit>
git -C /tmp/gavel ls-files | sed 's|^|gavel/|' \
  | tar -C /tmp --sort=name --mtime='<commit date> 00:00Z' --owner=0 --group=0 \
      --numeric-owner --mode='u+rw,go+r,go-w' -cf - -T - \
  | gzip -n -9 > vendor/gavel.tar.gz
```

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
