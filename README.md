# FleetMind — Project Documentation

**Offline-first fleet memory for warehouse robots, built on Qdrant Edge.**
Documentation for `fleetmind_v7.zip` (source tree `up2/`; the README changelog runs through v9).

---

## 1. Overview

FleetMind is a live simulation and demo console that shows how a fleet of robots can keep learning **without a network connection** and share what they learned **when the connection returns**.

Four simulated robots (A, B, C, D) drive routes across a 15×15 warehouse grid containing shelving, static pallets and patrolling forklifts. Each robot:

1. **Stores what it learns locally.** When it bumps into an obstacle it writes a memory into its own embedded **Qdrant Edge** shard, with no network calls.
2. **Plans with that memory.** Route costs come from vector-similarity search over the local shard.
3. **Syncs when online.** It pushes local memories to a central **Qdrant server** collection (the fleet store), where they are merged. It then pulls the merged fleet state back through a **partial snapshot**.

The result is that a robot can avoid an obstacle it has never seen, because another robot learned it and the fleet passed it on.

**Stack**

| Layer | Technology |
|---|---|
| Robot-local memory | `qdrant-edge-py` (embedded shards on disk) |
| Fleet memory | Qdrant server or Qdrant Cloud, via `qdrant-client` |
| Backend | Python, FastAPI, Uvicorn, NumPy |
| Embeddings | Spatial Gaussian grid embedding (local); text via Ollama `all-minilm` with a hash fallback |
| "Ask Robot" LLM | Ollama (`llama3.2:3b` by default) with a template fallback |
| Frontend | React 18, Vite 5, three.js, `ogl` (Aurora background), `lucide-react` |

---

## 2. Key Concepts

| Concept | Meaning |
|---|---|
| **Memory** | One point per grid cell. A cell is either `blocked` (obstacle seen) or `clear` (obstacle gone). |
| **Mutable shard** | Per-robot Edge shard holding *unsynced local writes*. |
| **Immutable shard** | Per-robot Edge shard holding a *copy of the fleet*, updated only by partial snapshots. |
| **Fleet store** | Qdrant collection `fleetmind_memory`, the merge point for all robots. |
| **Inherited knowledge** | A memory whose `sources` include a robot other than the one reading it. |
| **Ghost run** | A memory-less "naive" replay of the raw A* route. It shows which obstacles the real robot avoided. |
| **Uplink call** | Any request a robot makes to the fleet server. It is counted, and refused while the robot is offline. |
| **Chaos** | Injected latency and packet loss on sync. |
| **World seed** | Integer that reproduces a generated warehouse. |

---

## 3. Architecture

```
┌────────────────────────── Browser (React + three.js) ───────────────────────────┐
│  Landing (scroll story)  ──►  Console (3D stage, dock, minimap, tabbed panel)    │
└───────────────▲──────────────────────────────────────────────┬──────────────────┘
        SSE /api/stream  (fallback: poll /api/state)           │ POST /api/...
┌───────────────┴──────────────────────────────────────────────▼──────────────────┐
│ FastAPI (server/main.py, 127.0.0.1:8000, serves web build from server/dist)      │
│                                                                                  │
│  world  ── gen_world / world_tick        simulation loop (every 0.18 s ÷ speed)  │
│  Robot A─D                                                                       │
│    ├─ mutable  EdgeShard  ──► server/data/edge_<id>/mutable   (local writes)     │
│    └─ immutable EdgeShard ──► server/data/edge_<id>/immutable (fleet copy)       │
│                 │  push (upsert/merge)          ▲  pull (partial snapshot)       │
└─────────────────┼───────────────────────────────┼────────────────────────────────┘
                  ▼                               │
        ┌──────────────────────────────────────────────┐        ┌────────────────┐
        │ Qdrant server / Cloud: "fleetmind_memory"    │        │ Ollama (local) │
        │ vectors: space(225) + text(384)              │        │ embed + chat   │
        └──────────────────────────────────────────────┘        └────────────────┘
```

**Design points**

- All simulation state (world, robots, events) lives **in the backend process**. The UI is a pure view plus a set of command endpoints.
- The "network" is simulated by a flag (`online`). Every fleet-server call goes through `gate(r)`, which raises HTTP 409 if the robot is offline and otherwise increments `uplink`. "Zero uplink calls while offline" is therefore enforced in code.
- The backend serves the built frontend (`server/dist`) as static files, so production runs as a single process on port 8000.

---

## 4. Repository Layout

```
up2/
├── README.md                  # Short setup notes + version changelog (v1 → v9)
├── server/
│   ├── main.py                # Entire backend (~470 lines)
│   ├── requirements.txt       # fastapi, uvicorn, qdrant-edge-py, qdrant-client, numpy, requests
│   ├── .env.example           # QDRANT_URL, QDRANT_API_KEY, OLLAMA_MODEL
│   ├── data/                  # (created at runtime) edge_A … edge_D shard directories
│   └── dist/                  # Built frontend (output of `npm run build`)
└── web/
    ├── index.html             # Loads Inter + JetBrains Mono from Google Fonts
    ├── vite.config.js         # React plugin; dev proxy /api → localhost:8000
    ├── package.json           # react, three, ogl, lucide-react; vite
    └── src/
        ├── main.jsx           # React entry
        ├── App.jsx            # Shell (Landing ⇄ Console), Console, MiniMap, Timeline, Judge Mode
        ├── parts.jsx          # post(), Kpi, Ask, Vitals, Chaos, Footprint, helpers
        ├── Landing.jsx        # Marketing page and 640vh scroll-driven 3D story
        ├── scene3d.js         # Warehouse3D class (three.js scene, camera, effects)
        ├── Aurora.jsx/.css   # React Bits Aurora WebGL background (ogl)
        └── style.css          # Design tokens and all styling
```

---

## 5. Getting Started

### Prerequisites

- **Python 3.10+** (the backend uses modern syntax; the exact version isn't pinned in the repo)
- **Node.js 18+** (only needed to rebuild the UI)
- **A Qdrant server** reachable via `QDRANT_URL`: local Docker or Qdrant Cloud. It must support **partial snapshots** (`/shards/0/snapshot/partial/create`), which Qdrant Edge sync relies on.
- **Ollama** (optional): `ollama pull all-minilm` for text embeddings, and `ollama pull llama3.2:3b` for Ask Robot.

### Run

```bash
cd server
cp .env.example .env          # then edit QDRANT_URL (+ QDRANT_API_KEY for Cloud)
pip install -r requirements.txt
python main.py                # → http://localhost:8000
```

The server exits immediately with a message if `QDRANT_URL` is unset.

### Rebuild the UI (only after editing `web/`)

```bash
cd web
npm install
npm run build                 # emits into ../server/dist
```

### Frontend development with hot reload

```bash
cd server && python main.py           # terminal 1 (API on :8000)
cd web && npm run dev                 # terminal 2 (Vite; proxies /api → :8000)
```

---

## 6. Configuration

Read from `server/.env` (simple `KEY=VALUE`, `#` comments) or the process environment. Real environment variables win.

| Variable | Default | Purpose |
|---|---|---|
| `QDRANT_URL` | **required** | Fleet store URL, e.g. `http://localhost:6333` |
| `QDRANT_API_KEY` | none | API key for Qdrant Cloud; sent as the `api-key` header |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `all-minilm` | Text-embedding model |
| `OLLAMA_CHAT_MODEL` | `llama3.2:3b` | Model for "Ask Robot" |

> `OLLAMA_URL` and `OLLAMA_CHAT_MODEL` are supported by the code but are missing from `.env.example`.

**Embedding mode** is decided once at startup by probing Ollama. If it is unreachable, a deterministic hash embedding (384-dim) is used and the header chip says so. The vector size is fixed for the life of the process, so the fallback stays dimensionally consistent if Ollama dies later.

**Fixed constants** (top of `main.py`):

| Constant | Value | Meaning |
|---|---|---|
| `N` | 15 | Grid is 15×15 (225 cells) |
| `DIM` | 225 | Spatial vector size (one per cell) |
| `SIG` | 1.5 | Gaussian width of the spatial embedding |
| `NEAR` | 0.6 | Cosine threshold for "same blockage zone" / Ask |
| `TTL` | 8.0 s | How long a forklift (moving) memory is trusted |

---

## 7. Simulation Model

### 7.1 The warehouse

- **Grid:** 15×15, coordinates `(x, y)`, `(0,0)` top-left. Cell id = `y*15 + x`.
- **Shelves (impassable, fixed):** four blocks, x∈[2,5]/[9,12] × y∈[3,4]/[10,11].
- **Pallets:** static obstacles that are placed per world and can be added or removed at runtime.
- **Forklifts:** up to two, one horizontal and one vertical, each patrolling a 6-cell aisle segment back and forth. They advance one step every 4 simulation ticks.
- **`DYN`** is the union of pallets and current forklift cells. It is the ground truth of what is actually blocked *right now*.

### 7.2 World generation (`gen_world(seed)`)

A seed (5 digits, random if omitted) drives a `random.Random`. Up to 60 attempts build a world that must be **solvable**:

1. Pick lane A (horizontal row from `{1,5,6,7,8,9,13}`) and lane B (vertical column from `{1,6,7,8,13}`), each in a random direction. Lanes C and D are diagonals with randomised endpoints.
2. Seed a pallet at the **A/B crossing** `(ca, ra)`, so both robots are guaranteed to discover the same cell and trigger a fleet merge.
3. Add two random pallets on each lane's straight route (excluding the first and last two cells), plus three random free cells.
4. Verify every mission is still reachable with all pallets treated as walls. Otherwise retry.
5. Place the forklifts, avoiding shelves, pallets and mission endpoints.

The same seed reproduces the same world. The current seed is shown in the UI and can be re-entered under **Menu → New world**.

### 7.3 Robots and missions

Each robot has two missions (start→goal pairs), and the two lanes swap between robot pairs so one robot can drive the other's route:

| Robot | Mission 1 | Mission 2 |
|---|---|---|
| A | lane a | lane b |
| B | lane b | lane a |
| C | diagonal c | diagonal d |
| D | diagonal d | diagonal c |

### 7.4 Simulation loop

A single asyncio task runs every `0.18 s ÷ speed`:

- For each robot that is not mid-sync and is `running`, call `tick()` (one cell per tick).
- For each **online** robot, start a background sync if `want_sync` is set *or* every 45th tick (about 8 s at 1× speed).
- Every 4th tick, advance the forklifts (`world_tick`).

### 7.5 `Robot.tick()` logic

1. Advance the **ghost** (naive route, no memory) one step, counting its collisions.
2. If there is no path, `plan()`. If the plan is empty, the run ends.
3. **Sensor (radius 2):** any remembered `blocked` cell within Chebyshev distance 2 that is no longer in `DYN` is written as a `clear` memory. The path is dropped and a sync is requested.
4. If the next cell is in `DYN`: count a hit and a replan, write a `blocked` memory (`moving=True` unless it is a pallet), request a sync, and re-plan.
5. Otherwise step forward. On reaching the goal, record a run summary.

### 7.6 Planning (`plan()` / `cost_map()`)

- Plain A* (`astar`) on the grid, 4-connected, treating shelves as walls.
- **Memory-aware cost map:** for each cell within Chebyshev distance 4 of any remembered obstacle, run a **vector similarity search** over both local shards (`blocked_hits`, top 8).
  - Best score > 0.98 → the cell *is* a remembered obstacle → cost `1e6` (effectively a wall).
  - Best score > 0.35 → a small tie-breaking cost `0.15 × score` (never forces a detour).
- Forklift ("moving") memories older than `TTL` (8 s) are ignored, so confidence in them decays.
- Two recall traces are logged each plan: **spatial recall** (vector on `space`) and **semantic recall** (text query on `text`).
- `explain` stores raw-A* length vs memory-A* length, the matching memories, and the full cost grid for the "Why this route" view.

---

## 8. Memory Model

**Point ID:** `y*15 + x` (one point per cell, at most 225 per shard).

**Named vectors**

| Name | Size | Content |
|---|---|---|
| `space` | 225 | Normalised 2D Gaussian (σ=1.5) centred on the cell. Nearby cells have high cosine similarity. |
| `text` | 384 (Ollama `all-minilm`) or fallback | Embedding of the human-readable description. |

**Payload**

```json
{
  "kind": "blocked | clear",
  "x": 7, "y": 7,
  "moving": false,
  "ts": 1760000000.0,
  "synced_at": 1760000000.0,
  "text": "Pallet blocking the middle-central aisle at (7,7) on the way to the north-east zone; rerouted around it",
  "sources": ["A"],
  "count": 1,
  "history": [],
  "links": []
}
```

`where(x, y)` turns coordinates into a zone name (`north/middle/south` × `west/central/east`), which is used in memory text.

**Reading both shards:** `all_pts()` merges the immutable and mutable shards, with the newest `ts` winning per cell. `q()` queries both shards and de-duplicates by point id. Every `shard.query()` is timed for the latency metrics.

---

## 9. Sync and Merge Protocol

`sync(r)` runs in a worker thread. Steps:

1. **Gate:** refuse if offline. Set the "Syncing" state for about 1.2 s.
2. **Chaos (if enabled):** sleep for the configured latency, then drop the sync with probability `loss`%. A drop logs "⚠ uplink error" and the robot retries on the next cycle.
3. **Push:** scroll the robot's *mutable* shard (with vectors). For each memory, call `merge()` against the fleet collection.
4. **Pull:** request a **partial snapshot** from `POST /collections/fleetmind_memory/shards/0/snapshot/partial/create`, sending the immutable shard's `snapshot_manifest()`. Stream the result to a temp file and call `imm.update_from_snapshot()`. Only the *difference* travels. An "already up to date" empty snapshot is tolerated.
5. **Measure baseline:** `measure_full()` downloads a partial snapshot against an *empty* manifest, which is the true size of a full re-download. It is cached for 45 s.
6. **Clean up:** delete from the mutable shard everything with `synced_at ≤ stamp`, since it is now in the fleet.
7. **Report:** diff the immutable shard before and after to find new ("inherited") entries, refresh the fleet cache and emit events (`push`, `pull`, `merge`, `sync`).

### `merge(pid, vec, e, report)`

| Situation | Outcome | Report type |
|---|---|---|
| Cell not in fleet | Insert. If `blocked`, search for nearby blocked memories (cosine ≥ 0.6) confirmed by *different* sources and link them both ways. | `ZONE` (only when a link is made) |
| Same cell, same `kind` | Union the `sources`, bump `count`, rewrite text as "confirmed by A + B". No change if sources are identical. | `MERGED` |
| Same cell, different `kind` | **Newest `ts` wins.** The loser is appended to `history`. Sources are unioned. | `CONFLICT` |

The fleet collection has a keyword payload index on `kind`.

---

## 10. Backend API

Base URL `http://localhost:8000`. `{rid}` ∈ `A|B|C|D`. All POST endpoints return `{}` unless noted. There is no authentication.

| Method & path | Description |
|---|---|
| `GET /api/state` | Full state snapshot (JSON) |
| `GET /api/stream` | Server-Sent Events: full state every `0.2 s ÷ speed` |
| `POST /api/{rid}/run` | Start the mission (resets first if finished) |
| `POST /api/{rid}/pause` | Pause |
| `POST /api/{rid}/rerun` | Reset the run, keeping memory |
| `POST /api/{rid}/mission/{i}` | Switch to mission 0 or 1 |
| `POST /api/{rid}/online/{0\|1}` | Go offline or online (online triggers an immediate sync) |
| `POST /api/{rid}/wipe` | Recreate the robot, erasing its Edge shards |
| `POST /api/{rid}/ask` | Body `{ "q": "..." }`. Returns `{answer, cites, model}` |
| `POST /api/speed/{x}` | Simulation speed multiplier (float) |
| `POST /api/chaos` | Body `{on, latency (0–3000 ms), loss (0–90 %)}` |
| `POST /api/spawn` | Drop a new pallet on a random robot's route |
| `POST /api/obstacle-moved` | Remove a random pallet. Robots must *sense* the change. |
| `POST /api/reset?seed=N` | New world, clear events, recreate the fleet collection and all robots |
| `POST /api/footprint` | Run the Float32 vs Float16 benchmark |

**State payload (abridged)**

```
fleet[]            all fleet-store payloads (cached)
events[]           last 100 {id,t,kind,robot,text,…}  kind: push|pull|merge|sync|info
backend            {fleet, edge, embed}
chaos              {on, latency, loss}
robots{A..D}       pos,start,goal,trail,path,online,status,steps,hits,replans,done,running,
                   uplink,log[],mem[],runs[],mission,vitals{},explain{},ghost{}
dyn[]              currently blocked cells
world              {seed, pallets[], forks[]}
```

**Ask Robot (`ask()`):** answers **only from that robot's local memory**, with no fleet call, so it works offline. If the question contains coordinates such as `(11,7)`, it searches the `space` vector. Otherwise it embeds the question and searches `text`. With no hits it replies "I don't know." With hits, it asks the chat model (temperature 0, must cite `[#id]`), falling back to a template answer if Ollama is unavailable.

**Footprint benchmark:** builds 2,000 random 225-d points on scratch shards in Float32 and Float16, then reports disk size, p50 latency and top-1 self-retrieval accuracy (over 60 queries). It does not touch the robots.

---

## 11. Metrics: Definitions

| Metric | Definition |
|---|---|
| **Collisions avoided** | Σ over completed runs of `max(0, raw_hits − hits)`. `raw_hits` is the number of obstacle cells on the naive A* route at run start. `hits` is how many the robot actually bumped. |
| **Route efficiency** | `min(1, opt / steps) × 100`, where `opt` is the shortest route with all currently blocked cells as walls. It is averaged over runs. |
| **Query p50 / p95** | Percentiles over the last 200 shard queries, in ms. |
| **Sync avg** | Mean of the last 20 sync durations. |
| **Partial vs full** | `last partial snapshot bytes` ÷ `measured full snapshot bytes`. The UI shows `(1 − ratio)` as "% smaller". |
| **Shard data size** | *Logical* estimate: `points × ((225 + text_dim) × 4 + 320)` bytes. |
| **Shard disk size** | *Allocated* blocks from `st_blocks`. On Windows it uses `GetCompressedFileSizeW`. This matters because mmap files are preallocated. |
| **Uplink calls** | Count of fleet-server touches per robot. |

---

## 12. Frontend

### 12.1 Structure

- **`App`** toggles between **Landing** and **Console** with a short crossfade. It checks `/api/state` every 4 s for the "Live" chip.
- **`Console`** is the main application. Its data source is an `EventSource` on `/api/stream`. If the stream errors or stays silent for 2.5 s, it falls back to polling every 250 ms.
- **`Stage3D`** wraps the `Warehouse3D` class and feeds it each new state.

### 12.2 Console features

| Area | Features |
|---|---|
| **Nav island** | Back to overview, world seed, live/chaos/lost indicator, **Judge Mode**, Menu (New world with seed, drop pallet, remove pallet, Chaos sliders) |
| **Fleet rail** | Select a robot, with its status: Offline / Syncing / Synced |
| **Telemetry** | Collisions avoided, route efficiency, local query p50 |
| **Dock** | Run/Pause, Restart, Switch mission, 3D / Top / Follow camera, Ghost toggle, Replay, Online/Offline toggle, uplink counter |
| **Minimap** | Selected robot's own knowledge: learned, inherited (lavender), cleared (green), plus path and trail |
| **Tabbed panel** | **Timeline** (push/pull/merge events), **Robot** (Memory · Why this route · Ask · Log), **Results** (per-run table), **Vitals** (shard sizes, latency, sync savings, footprint benchmark) |

### 12.3 Judge Mode (automated demo script)

Runs at 2× speed and ends with a report modal.

1. New random world.
2. Robot A runs its route **offline**.
3. Robot B runs its route **offline**.
4. Shows the total uplink calls made (should be 0).
5. A then B reconnect, and memories fly to the fleet tower and merge.
6. B drives A's route, avoiding obstacles it never saw.
7. A drives B's route with fleet knowledge.
8. Mission report: collisions avoided, offline uplink calls, efficiency, p50 latency, sync saving, merged entries.

### 12.4 3D scene (`scene3d.js`)

`Warehouse3D` renders racks (instanced meshes), pallets, forklifts with blinking beacons, four robots (each with START pad, GOAL beacon, sensor ring, sync ring) and the violet **Fleet Memory tower**. Sync events launch glowing packets between robot and tower, and merges trigger expanding rings. Path tubes show trails, the planned route and the ghost route. `setPresent()`/`presentAt()` let the landing page drive the camera from scroll without touching OrbitControls.

### 12.5 Landing page

Hero, problem section, a **six-beat scroll story** (camera moves through six keyframes over the live scene), a live-number teaser fed by `/api/state`, an engineering section and a CTA. Aurora is a fixed WebGL background, and all sections are dark-themed.

### 12.6 Design tokens (`style.css`)

Dark graphite base, violet accent (`--accent #7C5CFF`), semantic colors (`--online` green, `--offline` red, `--syncing` violet). Fonts: Inter for UI, JetBrains Mono for coordinates, ids and telemetry. `prefers-reduced-motion` is respected.

---

## 13. Lifecycle and Persistence

- **Nothing persists across restarts.** On startup the fleet collection is deleted and recreated, and each `Robot()` wipes and recreates its `server/data/edge_<id>` directory.
- `POST /api/reset` repeats this for all robots and the fleet.
- `POST /api/{rid}/wipe` resets one robot's local memory only. The fleet copy is unaffected.

---

## 14. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Server exits: "Set QDRANT_URL…" | Missing `server/.env` or the variable |
| UI shows "Backend not reachable" | Backend not running, or wrong port. Use `python main.py` and open `localhost:8000`. |
| Header chip says "hash fallback" | Ollama not reachable. Run `ollama serve` and `ollama pull all-minilm`, then restart. |
| Sync errors / "uplink error" in log | Qdrant unreachable, wrong API key, a Qdrant version without partial-snapshot support, or Chaos packet loss |
| "I don't know" from Ask | The robot has no memory near that cell or topic. Run a mission first. |
| Ask returns a "template" answer | The chat model isn't available. Pull `llama3.2:3b` or set `OLLAMA_CHAT_MODEL`. |
| Blank/old UI after editing `web/` | Run `npm run build` (the server serves `server/dist`) |
| Text embedding dimension mismatch | The fleet collection was made with a different embedding size. Restart, which recreates it. |

---

## 15. Known Issues and Limitations

Found while reading the code:

- **Docs drift:** the `main.py` docstring says "two robots", but there are four. `.env.example` omits `OLLAMA_URL` and `OLLAMA_CHAT_MODEL`.
- **Color inconsistency:** README v8 says Robot A is green, but `scene3d.js` sets `COL.A = #38d5ff` (cyan) while CSS `--A` is green. The minimap also still uses a few older warm colors (`#B15C48`).
- **Single-process, in-memory state:** one shared world for all viewers. No multi-user isolation and no authentication. The server binds to `127.0.0.1` only.
- **Unknown robot id** in a URL (e.g. `/api/Z/run`) raises a `KeyError` (HTTP 500) rather than a 404.
- **Landing teaser placeholder:** the "3D SIMULATION — LIVE BELOW" box is a static placeholder.
- **Mission-report modal** is not restyled to the newer HUD look (noted in the README).
- **Mobile:** below 760px, overlays are hidden or stacked; there is no dedicated mobile layout.
- **No tests** are included.
- **Built bundle is committed** (`server/dist/assets/*.js` ≈ 827 KB), which is large mainly because of three.js.

---

## 16. Version History (from README)

| Version | Change |
|---|---|
| Base | Two Edge shards per robot, fleet server, hash/Ollama embeddings |
| + Vitals | Edge Vitals, "Why this route", Ask Robot, footprint benchmark |
| v4 | 3D world, minimap, random hazards, seeds |
| v5 | Industrial redesign (amber/graphite) |
| v6 | Full product website: landing, scroll story, mission timeline |
| v7 | Colors reverted to cyan/violet |
| v8 | Aurora background, full dark theme, camera-path fix |
| v9 | Live console redesign: edge-to-edge 3D stage, HUD dock, single tabbed panel, SSE fallback |

---

## 17. Extending the Project

- **More robots:** add an id to `MISSIONS`, `ROB` and `COL` (frontend and backend), and to the ids loops in `App.jsx`.
- **Different conflict policy:** edit `merge()` in `main.py` (e.g. confidence-weighted instead of newest-wins).
- **Larger map:** change `N`/`DIM` and `SHELF`, and mirror them in `scene3d.js`/`App.jsx`. The frontend duplicates the shelf layout.
- **New metrics:** add to `Robot.vitals()` (they flow through `state_payload` automatically), then render in `parts.jsx`.
- **Real robots:** replace `Robot.tick()` and the `DYN` ground truth with sensor input. The Edge shard, `sync()` and `merge()` logic can stay as they are.
