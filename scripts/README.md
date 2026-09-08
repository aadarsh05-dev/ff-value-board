# Rebuilding the boards

The three files in `data/` (`board_ppr.json`, `board_half.json`, `board_std.json`)
are the output of `build_board.py`. Everything is transparent and reproducible from
public data, so the board is not a black box.

## Data source

[nflverse](https://github.com/nflverse/nflverse-data) player weekly stats, the
`stats_player` release tag:

```
stats_player_week_2019.csv.gz ... stats_player_week_2025.csv.gz
```

150 columns, stable across all seven seasons. (Note: the older `player_stats`
release tag stops at 2024 and drops `team` and `passing_interceptions`, so it is
not used.) `build_board.py` expects these downloaded as
`scripts/nflv/spw{year}.csv.gz` (gitignored - they are large and re-downloadable).

## Pipeline

1. **Score every player-week** with a scoring formula verified exact on 40,330
   rows against nflverse's own fantasy point columns: passing yds x0.04,
   passing TD x4, INT x-2, rushing/receiving yds x0.1, rushing/receiving TD x6,
   reception x{0 standard, 0.5 half, 1 PPR}, offensive fumble lost x-2, 2-point
   conversion x2, special-teams TD x6.
2. **Project 2025 points per game**: a weighted average of the last two seasons'
   PPG (0.65 / 0.35), regressed toward the positional mean by games played, then
   multiplied by projected games.
3. **Replacement level** per position from league size and starter slots
   (12 teams; QB 1, RB 2, WR 3, TE 1, FLEX 1) - standard Value Based Drafting.
4. **VOR** = projected points minus that position's replacement level. Sorting
   the pool by VOR gives one cross-positional board.

## Regenerate

```
python scripts/build_board.py        # writes data/board_{ppr,half,std}.json + backtest table
python scripts/make_boards_js.py     # bundles them into data/boards.js for the static page
```

`make_boards_js.py` exists because the page runs from `file://` during local
testing, where the browser blocks `fetch()` of a local JSON file. `boards.js`
just assigns `window.BOARDS` / `window.BOARD_META`.
