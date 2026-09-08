# Fantasy Draft Value Board

A one-page draft board that ranks every player on a single cross-positional scale
tuned to your league's scoring, and tracks who is off the board as the draft
happens. There is no backend and no account, and nothing leaves the browser.

**Live:** _(Vercel URL goes here after deploy)_

<!-- Add docs/screenshot.png after the first deploy and uncomment:
![board screenshot](docs/screenshot.png) -->

## Problem

On draft night you have a stack of rankings and none of them fit the draft you
are actually in. They are built for PPR when your league is standard. They rank
running backs against running backs, so when you are on the clock choosing
between the best back left and the best receiver left, the list has no answer.
And a paper cheat sheet does not know that the two backs you wanted just went in
the last four picks.

I wanted one board that answers "who is the most valuable pick available right
now" in my league, and that updates as players come off the board.

## Process

**Projections.** Every player-week from 2019 to 2024 ([nflverse](https://github.com/nflverse/nflverse-data),
`stats_player` release) is scored with a fantasy formula checked exact on 40,330
rows against nflverse's own point columns. A 2025 projection is a weighted
average of the last two seasons' points per game (0.65 / 0.35), pulled toward the
positional average by how many games the player actually played, then scaled to a
projected game count. It is a simple method and you can read the whole thing in
[`scripts/build_board.py`](scripts/build_board.py).

**Value Over Replacement.** For a 12-team league with standard starter slots
(QB 1, RB 2, WR 3, TE 1, FLEX 1), the replacement level at each position is the
projected points of the last starter who would be drafted there. A player's VOR
is their projection minus that level. Sorting the whole pool by VOR is what turns
four position lists into one board, so a QB and a WR can be compared directly.

**Scope.** This started as a Next.js app with an LLM writing pick advice and a
full draft simulation. I cut both. The projection math does not need a model on
top of it, and a static page is something people can actually open on draft
night. What shipped is three files (`index.html`, `app.js`, `style.css`), the
board data as JSON, and the Python script that regenerates it. The features left
out on purpose are listed under [Iteration path](#iteration-path-not-in-v1).

## Outcome

A working tool:

- **Scoring toggle** (PPR / half / standard) reorders the entire board. Standard
  pushes Derrick Henry to the top; PPR puts Ja'Marr Chase at #1.
- **Sortable table** of 220 players: overall rank, player, position, team,
  projected points, projected PPG, VOR. Filter by position, search by name or
  team.
- **Draft tracking.** Mark a player `Gone` when another team takes them or `Mine`
  when you do. Marked players grey out, or hide entirely with a toggle. State
  lives in `localStorage`, so a refresh or a closed laptop does not lose the
  draft. One button resets it.
- **Best available.** The top-VOR undrafted player is highlighted in the table
  and shown in the sidebar, with a best-available-by-position strip that updates
  on every pick.
- **Your picks** list with a running positional count (RB 2 / WR 3 / QB 1 /
  TE 0), so late in the draft you can see what you still need.

### Backtest

For 2022 through 2025, a board was built using only the seasons before it, then
compared to what actually happened two ways: how many of its top-N at each
position finished top-N that year, and the rank correlation (Spearman) between
projected and actual finish. The naive baseline just ranks players by last
season's total points.

| Scoring | Model top-N hits | Naive top-N hits |
|---|---|---|
| PPR | 197 / 336 (59%) | 197 / 336 (59%) |
| Half | 195 / 336 (58%) | 195 / 336 (58%) |
| Standard | 191 / 336 (57%) | 200 / 336 (60%) |

On raw per-position hit rate the projection roughly ties "rank by last year's
points", and trails it slightly in standard scoring. Rank correlation by position
is uneven across seasons: receivers hold up best (Spearman around 0.4 to 0.6 in
most years), running backs land close to noise in some years (0.01 to 0.12 in
2023 and 2024) before a strong 2025. The full table is in
[`data/backtest.md`](data/backtest.md).

The value of the tool is not projection accuracy, since it ties a naive baseline
there. It is the cross-positional VOR ordering and the live draft tracking,
neither of which a plain points list gives you. The backtest section is here so
that tradeoff is visible before anyone relies on the board.

## Product decisions

- Static page, no accounts, `localStorage`. Draft night is not the time to make
  someone sign in, and local state keeps the draft data on the user's machine.
- No AI. The value question here is arithmetic; a model would add cost and latency
  for no accuracy gain. The evaluation-focused project in my portfolio is where
  the AI work lives, and this one is deliberately not that.
- A transparent projection over a better black box. Given the backtest, a method
  the user can read end to end is worth more here than a slightly sharper model
  they cannot inspect.
- Board data committed to the repo. It is small JSON, so the page has no network
  dependency after load and works offline.

## Limitations

- The backtest is four seasons (2022 to 2025). Small sample.
- A prior-year model cannot see rookies, so they are absent from the board.
- Kickers and team defense are excluded.
- Projections assume a healthy season, with no injury or depth-chart adjustment.
- Replacement levels are fixed to a 12-team standard-slot league. Other formats
  need a rebuild.
- On raw projection accuracy the model ties a naive baseline. The value is the
  cross-positional ordering and the live draft tracking.

## Iteration path (not in v1)

Snake-draft pick math with "your next pick is 18 spots away", ADP and
availability estimates so the board can weight urgency, roster-need re-ranking as
your roster fills in, live multi-device sync for a real draft room, and rookie
projections from draft capital and college production.

## Run it

```
# just open the file
open index.html

# or rebuild the data first
python scripts/build_board.py <dir-with-nflverse-csvs> data
python scripts/make_boards_js.py
```

## License

MIT. See [`LICENSE`](LICENSE).
