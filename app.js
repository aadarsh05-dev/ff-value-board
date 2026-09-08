/* Fantasy Draft Value Board - vanilla JS, no build step.
   Data comes from data/boards.js (window.BOARDS, window.BOARD_META),
   which is generated from data/board_{ppr,half,std}.json by scripts/make_boards_js.py. */

(function () {
  "use strict";

  var SCORING_KEY = "ffvb_scoring";
  var DRAFT_KEY = "ffvb_draft_v1";
  var POSITIONS = ["QB", "RB", "WR", "TE"];

  var state = {
    scoring: "ppr",
    sortKey: "overall_rank",
    sortDir: "asc",
    posFilter: "ALL",
    search: "",
    hideDrafted: false,
    marks: {},        // playerId -> "them" | "mine"
    order: []         // playerIds in the order they were marked
  };

  var byId = {};       // playerId -> player object, for the active scoring

  // ---------- persistence ----------
  function loadState() {
    try {
      var s = localStorage.getItem(SCORING_KEY);
      if (s && window.BOARDS[s]) state.scoring = s;
    } catch (e) { /* private mode, ignore */ }
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && typeof d === "object") {
          state.marks = d.marks && typeof d.marks === "object" ? d.marks : {};
          state.order = Array.isArray(d.order) ? d.order : Object.keys(state.marks);
        }
      }
    } catch (e) { state.marks = {}; state.order = []; }
  }

  function saveScoring() {
    try { localStorage.setItem(SCORING_KEY, state.scoring); } catch (e) {}
  }
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ marks: state.marks, order: state.order }));
    } catch (e) {}
  }

  // ---------- helpers ----------
  function activeBoard() { return window.BOARDS[state.scoring] || []; }

  function buildIndex() {
    byId = {};
    activeBoard().forEach(function (p) { byId[p.id] = p; });
  }

  function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  function markPlayer(id, tag) {
    if (state.marks[id] === tag) {
      delete state.marks[id];
      var i = state.order.indexOf(id);
      if (i !== -1) state.order.splice(i, 1);
    } else {
      var isNew = !state.marks[id];
      state.marks[id] = tag;
      if (isNew) state.order.push(id);
    }
    saveDraft();
    render();
  }

  function resetDraft() {
    if (!window.confirm("Clear every drafted and picked player?")) return;
    state.marks = {};
    state.order = [];
    saveDraft();
    render();
  }

  // ---------- rendering ----------
  function visibleRows() {
    var q = state.search.trim().toLowerCase();
    var rows = activeBoard().filter(function (p) {
      if (state.posFilter !== "ALL" && p.pos !== state.posFilter) return false;
      if (state.hideDrafted && state.marks[p.id]) return false;
      if (q) {
        if (p.name.toLowerCase().indexOf(q) === -1 &&
            p.team.toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });

    var key = state.sortKey, dir = state.sortDir === "asc" ? 1 : -1;
    rows.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
    return rows;
  }

  function bestAvailableId() {
    var board = activeBoard();
    for (var i = 0; i < board.length; i++) {
      if (!state.marks[board[i].id]) return board[i].id;
    }
    return null;
  }

  function renderTable() {
    var body = document.getElementById("board-body");
    var rows = visibleRows();
    var bestId = bestAvailableId();
    var html = "";

    rows.forEach(function (p) {
      var mark = state.marks[p.id];
      var cls = [];
      if (mark === "them") cls.push("gone");
      if (mark === "mine") cls.push("mine");
      if (p.id === bestId) cls.push("best");

      html +=
        '<tr class="' + cls.join(" ") + '" data-id="' + p.id + '">' +
        '<td class="num">' + p.overall_rank + "</td>" +
        '<td class="name">' + escapeHtml(p.name) + "</td>" +
        '<td><span class="pos-tag pos-' + p.pos + '">' + p.pos + "</span></td>" +
        "<td>" + p.team + "</td>" +
        '<td class="num">' + fmt1(p.proj_points) + "</td>" +
        '<td class="num">' + fmt1(p.proj_ppg) + "</td>" +
        '<td class="num">' + fmt1(p.vor) + "</td>" +
        '<td><div class="row-actions">' +
        '<button class="act-them' + (mark === "them" ? " on-them" : "") + '" data-act="them">Gone</button>' +
        '<button class="act-mine' + (mark === "mine" ? " on-mine" : "") + '" data-act="mine">Mine</button>' +
        "</div></td></tr>";
    });

    body.innerHTML = html || '<tr><td colspan="8" style="padding:16px;color:#5b6472">No players match.</td></tr>';

    document.getElementById("count-line").textContent =
      rows.length + " shown / " + activeBoard().length + " on board  |  " +
      countMarks("them") + " gone  |  " + countMarks("mine") + " yours";
  }

  function countMarks(tag) {
    var n = 0;
    for (var id in state.marks) if (state.marks[id] === tag) n++;
    return n;
  }

  function renderSidebar() {
    // best available (overall)
    var bestId = bestAvailableId();
    var main = document.getElementById("best-available-main");
    if (bestId) {
      var b = byId[bestId];
      main.innerHTML = escapeHtml(b.name) +
        "<small>" + b.pos + " - " + b.team + "  |  VOR " + fmt1(b.vor) +
        "  |  overall #" + b.overall_rank + "</small>";
    } else {
      main.textContent = "--";
    }

    // best available by position
    var strip = document.getElementById("ba-strip");
    strip.innerHTML = POSITIONS.map(function (pos) {
      var pick = null;
      var board = activeBoard();
      for (var i = 0; i < board.length; i++) {
        if (board[i].pos === pos && !state.marks[board[i].id]) { pick = board[i]; break; }
      }
      if (!pick) return '<div class="ba-cell"><span class="ba-pos">' + pos + '</span><span class="ba-name">--</span></div>';
      return '<div class="ba-cell"><span class="ba-pos">' + pos + '</span>' +
        '<span class="ba-name">' + escapeHtml(pick.name) + "</span>" +
        '<span class="ba-vor">VOR ' + fmt1(pick.vor) + "</span></div>";
    }).join("");

    // your picks
    var mine = state.order.filter(function (id) { return state.marks[id] === "mine"; });
    var counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
    mine.forEach(function (id) { var p = byId[id]; if (p && counts.hasOwnProperty(p.pos)) counts[p.pos]++; });

    document.getElementById("pos-counts").innerHTML =
      POSITIONS.map(function (pos) { return "<span>" + pos + " " + counts[pos] + "</span>"; }).join("");

    var list = document.getElementById("my-picks-list");
    list.innerHTML = mine.map(function (id) {
      var p = byId[id];
      var label = p ? escapeHtml(p.name) + " (" + p.pos + " - " + p.team + ")" : id;
      return "<li>" + label + '<button data-unpick="' + id + '">remove</button></li>';
    }).join("");
  }

  function renderMeta() {
    var m = window.BOARD_META[state.scoring];
    document.getElementById("meta-line").textContent =
      m.season + " season  |  " + state.scoring.toUpperCase() + "  |  " + m.teams +
      "-team league  |  replacement level  QB " + m.replacement.QB +
      "  RB " + m.replacement.RB + "  WR " + m.replacement.WR + "  TE " + m.replacement.TE +
      "  |  model built from " + m.generated_from_seasons;
  }

  function render() {
    renderMeta();
    renderTable();
    renderSidebar();
    syncHeaderSortClasses();
  }

  function syncHeaderSortClasses() {
    document.querySelectorAll("th.sortable").forEach(function (th) {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.getAttribute("data-sort") === state.sortKey) {
        th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- wiring ----------
  function wire() {
    document.querySelector(".scoring-toggle").addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      state.scoring = btn.getAttribute("data-scoring");
      saveScoring();
      buildIndex();
      setActive(".scoring-toggle button", btn);
      render();
    });

    document.querySelector(".pos-filter").addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      state.posFilter = btn.getAttribute("data-pos");
      setActive(".pos-filter button", btn);
      renderTable();
    });

    document.getElementById("search").addEventListener("input", function (e) {
      state.search = e.target.value;
      renderTable();
    });

    document.getElementById("hide-drafted").addEventListener("change", function (e) {
      state.hideDrafted = e.target.checked;
      renderTable();
    });

    document.getElementById("reset-draft").addEventListener("click", resetDraft);

    document.getElementById("board-body").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-act]");
      if (!btn) return;
      var tr = btn.closest("tr");
      markPlayer(tr.getAttribute("data-id"), btn.getAttribute("data-act"));
    });

    document.getElementById("my-picks-list").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-unpick]");
      if (!btn) return;
      markPlayer(btn.getAttribute("data-unpick"), "mine"); // same tag -> unmark
    });

    document.querySelector("thead").addEventListener("click", function (e) {
      var th = e.target.closest("th.sortable");
      if (!th) return;
      var key = th.getAttribute("data-sort");
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = (key === "name" || key === "pos" || key === "team") ? "asc" : "desc";
        if (key === "overall_rank") state.sortDir = "asc";
      }
      render();
    });
  }

  function setActive(selector, btn) {
    document.querySelectorAll(selector).forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
  }

  // ---------- boot ----------
  if (!window.BOARDS) {
    document.getElementById("board-body").innerHTML =
      '<tr><td colspan="8" style="padding:16px">Could not load board data (data/boards.js).</td></tr>';
    return;
  }
  loadState();
  buildIndex();
  // reflect restored scoring in the toggle
  document.querySelectorAll(".scoring-toggle button").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-scoring") === state.scoring);
  });
  document.getElementById("hide-drafted").checked = state.hideDrafted;
  wire();
  render();
})();
