# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/lenhan54/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/lenhan54/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: it reads a sealed snapshot of DeFi protocols and writes a
web dashboard ranking the pre-token protocols by what their launch would be
worth, each with the steps to farm it.

## How to run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `board.json`, the dashboard's
data, `dashboard/`, `screenshots/` and `dossier.json` into the output directory.
It reads only the snapshot file and never touches the network. The ranking is
computed from the snapshot's own figures (TVL, growth, maturity, chain breadth,
category) — no protocol name is ever special-cased.
