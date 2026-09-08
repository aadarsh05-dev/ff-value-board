"""Build the value boards + backtest table from nflverse weekly data.
Usage: python build_board.py <dir-with-spwYYYY.csv.gz> <output-data-dir>
Writes board_{ppr,half,std}.json and eval-results.md into the output dir.
See scripts/README.md for the data source and the projection / VOR method."""
import gzip, csv, json, statistics, sys
from pathlib import Path

SD = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
YEARS = list(range(2019, 2026))
SKILL = {"QB", "RB", "WR", "TE"}
# 12-team standard starters; FLEX drawn from RB/WR/TE
SLOTS = {"QB": 1, "RB": 2, "WR": 3, "TE": 1, "FLEX": 1}


def num(v):
    try:
        return float(v) if v not in ("", "NA", None) else 0.0
    except Exception:
        return 0.0


def load(year):
    with gzip.open(SD / f"spw{year}.csv.gz", "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["season_type"] != "REG":
                continue
            if r["position"] not in SKILL:
                continue
            yield r


def pts(r, ppr):
    fum = num(r["rushing_fumbles_lost"]) + num(r["receiving_fumbles_lost"]) + num(r["sack_fumbles_lost"])
    return (
        num(r["passing_yards"]) * 0.04 + num(r["passing_tds"]) * 4 - num(r["passing_interceptions"]) * 2
        + num(r["rushing_yards"]) * 0.1 + num(r["rushing_tds"]) * 6
        + num(r["receiving_yards"]) * 0.1 + num(r["receiving_tds"]) * 6
        + num(r["receptions"]) * ppr - fum * 2
        + (num(r["passing_2pt_conversions"]) + num(r["rushing_2pt_conversions"]) + num(r["receiving_2pt_conversions"])) * 2
        + num(r["special_teams_tds"]) * 6
    )


def season_table():
    tbl = {}
    for y in YEARS:
        agg = {}
        for r in load(y):
            pid = r["player_id"]
            d = agg.setdefault(pid, {"g": 0, "ppr": 0.0, "half": 0.0, "std": 0.0,
                                     "name": r["player_display_name"], "pos": r["position"], "team": r["team"]})
            d["g"] += 1
            d["ppr"] += pts(r, 1.0)
            d["half"] += pts(r, 0.5)
            d["std"] += pts(r, 0.0)
            d["name"] = r["player_display_name"]
            d["team"] = r["team"]
            d["pos"] = r["position"]
        for pid, d in agg.items():
            tbl.setdefault(pid, {})[y] = d
    return tbl


TBL = season_table()


def project(pid, target_year, fmt):
    """Season-points projection using only years < target_year. Weighted prior-2-season PPG
    (0.65/0.35), regressed toward the positional mean by games played, times projected games."""
    hist = sorted([(y, TBL[pid][y]) for y in TBL.get(pid, {}) if y < target_year], reverse=True)
    if not hist:
        return None
    pos = hist[0][1]["pos"]
    prev = target_year - 1
    pool = [d[fmt] / d["g"] for _p, years in TBL.items() for yy, d in years.items()
            if yy == prev and d["pos"] == pos and d["g"] >= 6]
    pos_mean = statistics.mean(pool) if pool else 8.0
    wts = [0.65, 0.35]
    ppgs, gms = [], []
    for (_y, d) in hist[:2]:
        ppgs.append(d[fmt] / d["g"])
        gms.append(d["g"])
    w = wts[:len(ppgs)]
    raw_ppg = sum(a * b for a, b in zip(ppgs, w)) / sum(w)
    g_recent = gms[0]
    k = 4.0
    reg_ppg = (raw_ppg * g_recent + pos_mean * k) / (g_recent + k)
    proj_g = min(17, max(10, g_recent))
    return {"proj_points": round(reg_ppg * proj_g, 1), "proj_ppg": round(reg_ppg, 2),
            "pos": pos, "name": hist[0][1]["name"], "team": hist[0][1]["team"]}


def replacement_levels(projs, teams, slots=SLOTS):
    by = {"QB": [], "RB": [], "WR": [], "TE": []}
    for p in projs.values():
        if p["pos"] in by:
            by[p["pos"]].append(p["proj_points"])
    for k in by:
        by[k].sort(reverse=True)
    starters = {"QB": slots["QB"] * teams, "RB": slots["RB"] * teams,
                "WR": slots["WR"] * teams, "TE": slots["TE"] * teams}
    flex_n = slots["FLEX"] * teams
    band = sorted([(v, po) for po in ("RB", "WR", "TE") for v in by[po]], reverse=True)
    lo = starters["RB"] + starters["WR"] + starters["TE"]
    flex_counts = {"RB": 0, "WR": 0, "TE": 0}
    for v, po in band[lo:lo + flex_n]:
        flex_counts[po] += 1
    repl = {}
    for pos in ("QB", "RB", "WR", "TE"):
        idx = starters[pos] + flex_counts.get(pos, 0)
        arr = by[pos]
        repl[pos] = arr[idx - 1] if 0 < idx <= len(arr) else (arr[-1] if arr else 0.0)
    return repl


def build_board(target_year, fmt, teams=12):
    projs = {pid: pr for pid in TBL if (pr := project(pid, target_year, fmt))}
    repl = replacement_levels(projs, teams)
    board = []
    for pid, p in projs.items():
        board.append({"id": pid, "name": p["name"], "pos": p["pos"], "team": p["team"],
                      "proj_points": p["proj_points"], "proj_ppg": p["proj_ppg"],
                      "vor": round(p["proj_points"] - repl[p["pos"]], 1)})
    board.sort(key=lambda x: x["vor"], reverse=True)
    for i, b in enumerate(board, 1):
        b["overall_rank"] = i
    return board, repl


def actual_finish(year, fmt):
    rows = {pid: (y[year][fmt], y[year]["pos"]) for pid, y in TBL.items()
            if year in y and y[year]["g"] >= 1}
    out = {}
    for pos in ("QB", "RB", "WR", "TE"):
        ps = sorted([(v, pid) for pid, (v, po) in rows.items() if po == pos], reverse=True)
        for rank, (_v, pid) in enumerate(ps, 1):
            out[pid] = (pos, rank)
    return out


def spearman(pairs):
    n = len(pairs)
    if n < 3:
        return None
    xs = sorted(range(n), key=lambda i: pairs[i][0])
    ys = sorted(range(n), key=lambda i: pairs[i][1])
    rx = {i: r for r, i in enumerate(xs)}
    ry = {i: r for r, i in enumerate(ys)}
    d2 = sum((rx[i] - ry[i]) ** 2 for i in range(n))
    return round(1 - 6 * d2 / (n * (n * n - 1)), 3)


def backtest(fmt):
    L = [f"### {fmt.upper()} scoring\n",
         "| Season | Pos | Top N | Model hits | Naive hits | Spearman |",
         "|---|---|---|---|---|---|"]
    tot_m = tot_n = tot_t = 0
    for ty in range(2022, 2026):
        board, _ = build_board(ty, fmt)
        actual = actual_finish(ty, fmt)
        py = ty - 1
        naive = {}
        for pos in ("QB", "RB", "WR", "TE"):
            arr = sorted([(TBL[pid][py][fmt], pid) for pid in TBL
                          if py in TBL[pid] and TBL[pid][py]["pos"] == pos and TBL[pid][py]["g"] >= 1], reverse=True)
            for r, (_v, pid) in enumerate(arr, 1):
                naive[pid] = (pos, r)
        for pos, topn in (("RB", 24), ("WR", 36), ("QB", 12), ("TE", 12)):
            mr = [b for b in board if b["pos"] == pos][:topn]
            m_ids = {b["id"] for b in mr}
            n_ids = {pid for pid, (po, r) in naive.items() if po == pos and r <= topn}
            a_top = {pid for pid, (po, r) in actual.items() if po == pos and r <= topn}
            sp = spearman([(b["overall_rank"], actual[b["id"]][1]) for b in mr if b["id"] in actual])
            L.append(f"| {ty} | {pos} | {topn} | {len(m_ids & a_top)} | {len(n_ids & a_top)} | {sp if sp is not None else 'n/a'} |")
            tot_m += len(m_ids & a_top)
            tot_n += len(n_ids & a_top)
            tot_t += topn
    L.append(f"\n**{fmt.upper()} totals, 2022-2025:** model {tot_m}/{tot_t} ({tot_m / tot_t:.0%}) vs naive {tot_n}/{tot_t} ({tot_n / tot_t:.0%}).\n")
    return "\n".join(L)


for fmt in ("ppr", "half", "std"):
    board, repl = build_board(2025, fmt)
    (OUT / f"board_{fmt}.json").write_text(json.dumps({
        "season": 2025, "scoring": fmt, "teams": 12,
        "replacement": {k: round(v, 1) for k, v in repl.items()},
        "generated_from_seasons": "2019-2024",
        "players": board[:220],
    }, indent=1))

txt = ("# Backtest results\n\nEach season's board is built using only prior seasons (no lookahead). "
       "Naive baseline ranks players by the previous season's total fantasy points. "
       "Top-N hits = how many of the board's top-N at a position actually finished top-N that year.\n\n")
for fmt in ("ppr", "half", "std"):
    txt += backtest(fmt) + "\n"
(OUT / "eval-results.md").write_text(txt)
print("wrote:", sorted(p.name for p in OUT.iterdir()))
print()
print(txt)
