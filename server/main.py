"""FleetMind server: two robots, each with its OWN Qdrant Edge shard on disk, plus a fleet store
(qdrant-client local mode, or a real Qdrant server if QDRANT_URL is set). Run: python main.py"""
import os, sys, re, json, time, secrets, shutil, heapq, asyncio, hashlib, tempfile, statistics, random, numpy as np, requests
from collections import deque
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from qdrant_edge import (EdgeShard, EdgeConfig, EdgeVectorParams, Distance, Point, UpdateOperation,
                         QueryRequest, Query, ScrollRequest, Filter, FieldCondition, MatchValue, RangeFloat,
                         CountRequest, VectorStorageDatatype)
from qdrant_client import QdrantClient, models as qm

N, SIG, NEAR, DIM = 15, 1.5, 0.6, 225
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "data")
if os.path.exists(os.path.join(HERE, ".env")):   # optional server/.env with QDRANT_URL=... QDRANT_API_KEY=...
    for _l in open(os.path.join(HERE, ".env")):
        if "=" in _l and not _l.lstrip().startswith("#"): _k, _v = _l.strip().split("=", 1); os.environ.setdefault(_k, _v.strip().strip('"'))
QURL, QKEY = os.environ.get("QDRANT_URL", "").rstrip("/"), os.environ.get("QDRANT_API_KEY")
if not QURL: sys.exit("Set QDRANT_URL (and QDRANT_API_KEY for Qdrant Cloud) in server/.env. See README.")
HDR = {"api-key": QKEY} if QKEY else {}
OLLAMA, OMODEL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434"), os.environ.get("OLLAMA_MODEL", "all-minilm")
EMB = {"src": "", "dim": 384}
def _hash_embed(t, d):
    v = np.zeros(d)
    for w in re.findall(r"[a-z0-9]+", t.lower()): h = int(hashlib.md5(w.encode()).hexdigest(), 16); v[h % d] += 1 if (h >> 20) & 1 else -1
    return (v / (np.linalg.norm(v) or 1)).tolist()
def text_embed(t):   # local Ollama (localhost, no internet); falls back to a hash embedding if Ollama is not running
    try: return requests.post(OLLAMA + "/api/embed", json={"model": OMODEL, "input": t}, timeout=30).json()["embeddings"][0]
    except Exception: return _hash_embed(t, EMB["dim"])
try:
    _r = requests.post(OLLAMA + "/api/embed", json={"model": OMODEL, "input": "probe"}, timeout=60)
    EMB.update(src=f"Ollama {OMODEL}", dim=len(_r.json()["embeddings"][0]))
except Exception as _e:
    print("Ollama probe failed:", repr(_e)); EMB.update(src="hash fallback (Ollama not reachable)")
print("Text embeddings:", EMB["src"], "dim", EMB["dim"])
def where(x, y): return ("north" if y < 5 else "south" if y > 9 else "middle") + "-" + ("west" if x < 5 else "east" if x > 9 else "central")
GX, GY = np.meshgrid(np.arange(N), np.arange(N))
def _emb(x, y):
    v = np.exp(-((GX - x) ** 2 + (GY - y) ** 2) / (2 * SIG ** 2)).ravel(); return (v / np.linalg.norm(v)).tolist()
CELL = [_emb(i % N, i // N) for i in range(N * N)]   # embedding of every grid cell (local, no network)
SHELF = {(x, y) for a, b, c, d in [(2, 5, 3, 4), (9, 12, 3, 4), (2, 5, 10, 11), (9, 12, 10, 11)]
         for x in range(a, b + 1) for y in range(c, d + 1)}
DYN = {(3, 7), (7, 7), (11, 7), (7, 12), (7, 3)}      # same warehouse for both robots
BLK = Filter(must=[FieldCondition(key="kind", match=MatchValue(value="blocked"))])
EV, EID = [], [0]
def ev(kind, robot, text, **kw):
    EID[0] += 1; EV.append(dict(id=EID[0], t=time.time(), kind=kind, robot=robot, text=text, **kw)); del EV[:-150]

def _alloc(path):   # bytes actually allocated on disk (mmap chunks are preallocated/sparse, so file length lies)
    try:
        st = os.stat(path)
        if hasattr(st, "st_blocks"): return st.st_blocks * 512
        import ctypes; hi = ctypes.c_ulong(0); lo = ctypes.windll.kernel32.GetCompressedFileSizeW(ctypes.c_wchar_p(path), ctypes.byref(hi))
        return st.st_size if lo == 0xFFFFFFFF else (hi.value << 32) + lo
    except Exception: return 0
def _dir_size(path):
    return sum(_alloc(os.path.join(r, f)) for r, _d, fs in os.walk(path) for f in fs)

def econf(dt=None):
    sp = dict(size=DIM, distance=Distance.Cosine); sp.update(datatype=dt) if dt else None
    return EdgeConfig(vectors={"space": EdgeVectorParams(**sp), "text": EdgeVectorParams(size=EMB["dim"], distance=Distance.Cosine)})
FLEET = QdrantClient(url=QURL, api_key=QKEY); COL = "fleetmind_memory"
FCACHE = []
def fleet_init():
    if FLEET.collection_exists(COL): FLEET.delete_collection(COL)
    FLEET.create_collection(COL, vectors_config={"space": qm.VectorParams(size=DIM, distance=qm.Distance.COSINE), "text": qm.VectorParams(size=EMB["dim"], distance=qm.Distance.COSINE)})
    FLEET.create_payload_index(COL, "kind", qm.PayloadSchemaType.KEYWORD)
    FCACHE[:] = []
fleet_init()
def label(p): return f"[{'+'.join(p['sources'])}] {p['text']}"

def merge(pid, vec, e, report):
    """Reconcile one robot memory with the fleet collection. Returns True if the fleet changed."""
    cur = FLEET.retrieve(COL, [pid], with_payload=True)
    if cur:
        m = dict(cur[0].payload)
        if m["kind"] == e["kind"]:
            src = sorted(set(m["sources"]) | set(e["sources"]))
            if src == sorted(m["sources"]): return False
            report.append(dict(type="MERGED", a=label(m), b=label(e), result=f"One entry, {e['kind']} at ({e['x']},{e['y']}), independently confirmed by {' + '.join(src)}."))
            FLEET.set_payload(COL, dict(sources=src, count=len(src), ts=max(m["ts"], e["ts"]),
                text=f"{'Obstacle' if e['kind']=='blocked' else 'Free cell'} at ({e['x']},{e['y']}), confirmed by {' + '.join(src)}"), points=[pid])
            return True
        win, lose = (e, m) if e["ts"] > m["ts"] else (m, e)
        report.append(dict(type="CONFLICT", a=label(m), b=label(e), result=f"Newest observation wins: {win['kind']} at ({e['x']},{e['y']}). Older claim kept in history."))
        src = sorted(set(m["sources"]) | set(e["sources"])); hist = m.get("history", []) + [dict(kind=lose["kind"], by=lose["sources"])]
        if win is e: FLEET.upsert(COL, [qm.PointStruct(id=pid, vector=vec, payload={**e, "sources": src, "history": hist, "links": m.get("links", [])})])
        else: FLEET.set_payload(COL, dict(sources=src, history=hist), points=[pid])
        return True
    FLEET.upsert(COL, [qm.PointStruct(id=pid, vector=vec, payload=e)])
    if e["kind"] == "blocked":
        for h in FLEET.query_points(COL, query=vec["space"], using="space", query_filter=qm.Filter(must=[qm.FieldCondition(key="kind", match=qm.MatchValue(value="blocked"))]), limit=6, with_payload=True).points:
            if h.id != pid and h.score >= NEAR and set(h.payload["sources"]) != set(e["sources"]):
                for x, y in ((pid, h.id), (h.id, pid)):
                    old = FLEET.retrieve(COL, [x], with_payload=True)[0].payload.get("links", [])
                    FLEET.set_payload(COL, {"links": sorted(set(old) | {y})}, points=[x])
                report.append(dict(type="ZONE", a=label(h.payload), b=label(e), result=f"Different cells, vector similarity {h.score:.2f}: linked as one blockage zone. Both kept."))
    return True

# ---------- pathfinding ----------
def astar(s, g, cost=None):
    pq, best, came = [(0, s)], {s: 0}, {}
    while pq:
        _, c = heapq.heappop(pq)
        if c == g:
            p = []
            while c != s: p.append(c); c = came[c]
            return p[::-1]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c[0] + dx, c[1] + dy)
            if not (0 <= n[0] < N and 0 <= n[1] < N) or n in SHELF: continue
            if cost is not None and n != g and cost[n[1] * N + n[0]] >= 1e5: continue
            ng = best[c] + 1 + (0 if cost is None or n == g else cost[n[1] * N + n[0]])
            if ng < best.get(n, 1e9):
                best[n] = ng; came[n] = c; heapq.heappush(pq, (ng + abs(n[0] - g[0]) + abs(n[1] - g[1]), n))
    return []

MISSIONS = {"A": [((0, 7), (14, 7)), ((7, 14), (7, 0))], "B": [((7, 14), (7, 0)), ((0, 7), (14, 7))],
            "C": [((0, 0), (14, 14)), ((0, 14), (14, 0))], "D": [((0, 14), (14, 0)), ((0, 0), (14, 14))]}
class Robot:
    def __init__(s, rid):
        s.id = rid; base = os.path.join(DATA, "edge_" + rid); shutil.rmtree(base, ignore_errors=True)
        s.mdir, s.idir = os.path.join(base, "mutable"), os.path.join(base, "immutable"); os.makedirs(s.mdir); os.makedirs(s.idir)
        s.mut, s.imm = EdgeShard.create(s.mdir, econf()), EdgeShard.create(s.idir, econf())   # local writes | snapshot copy of the fleet
        s.online, s.uplink, s.sync_until, s.runs, s.log = False, 0, 0, [], []
        s.syncing = s.want_sync = s.announce = False
        # ── Phase 1: Edge Vitals metrics ──
        s.query_latencies = deque(maxlen=200)   # ms, from every shard.query()
        s.sync_durations = deque(maxlen=20)     # ms
        s.sync_snap_bytes = deque(maxlen=20)    # bytes of each partial snapshot downloaded
        s.full_bytes, s.full_at, s.explain, s.cnt = 0, 0, None, [0, 0]   # full re-download size (measured) and last plan explanation
        s._disk_cache = (0, 0, 0)               # (ts, mut_bytes, imm_bytes)
        s.set_mission(0); s.refresh()
    def say(s, t): s.log.insert(0, t); del s.log[50:]
    def set_mission(s, i):
        s.mission = i; s.start, s.goal = MISSIONS[s.id][i]; s.reset_run()
    def reset_run(s):
        s.pos, s.trail, s.path, s.steps, s.hits, s.replans, s.done, s.running = s.start, [s.start], [], 0, 0, 0, False, False
        s.ghost_path, s.ghost_pos, s.ghost_trail, s.ghost_hits, s.ghost_done = [], s.start, [s.start], 0, False   # ghost = naive route, no memory, walks straight into everything
    def all_pts(s):   # merged view of both shards; newest observation wins per cell
        d = {}
        s.cnt = [0, 0]
        for k, sh in enumerate((s.imm, s.mut)):
            rows = sh.scroll(ScrollRequest(limit=500, with_payload=True, with_vector=False))[0]; s.cnt[k] = len(rows)
            for r in rows:
                p = dict(r.payload)
                if r.id not in d or p["ts"] >= d[r.id]["ts"]: d[r.id] = p
        return d
    def refresh(s): s.mem = list(s.all_pts().values())
    def q(s, vec, using, k):   # similarity search over BOTH shards, de-duplicated by point id
        best = {}
        for sh in (s.imm, s.mut):
            t0 = time.perf_counter()
            hits = sh.query(QueryRequest(limit=k, query=Query.Nearest(vec, using=using), with_payload=True))
            s.query_latencies.append((time.perf_counter() - t0) * 1000)  # ms
            for h in hits:
                if h.id not in best or dict(h.payload)["ts"] >= dict(best[h.id].payload)["ts"]: best[h.id] = h
        return sorted(best.values(), key=lambda h: -h.score)
    def status(s): return "Syncing" if (s.syncing or time.time() < s.sync_until) else ("Synced" if s.online else "Offline")
    def vitals(s):
        now = time.time()
        # Disk size (cached for 2s)
        if now - s._disk_cache[0] > 2:
            s._disk_cache = (now, _dir_size(s.mdir), _dir_size(s.idir))
        mut_bytes, imm_bytes = s._disk_cache[1], s._disk_cache[2]
        # Point counts
        imm_count, mut_count = s.cnt   # cached by refresh(): never touch a shard from the polling thread (races with snapshot restore)
        per = (DIM + EMB["dim"]) * 4 + 320   # logical bytes per memory: two float32 vectors + payload
        # Query latency percentiles
        lats = sorted(s.query_latencies) if s.query_latencies else [0]
        p50 = lats[len(lats) // 2]
        p95 = lats[int(len(lats) * 0.95)] if len(lats) > 1 else lats[0]
        # Sync stats
        avg_sync = round(statistics.mean(s.sync_durations), 1) if s.sync_durations else 0
        last_snap = s.sync_snap_bytes[-1] if s.sync_snap_bytes else 0
        baseline = s.full_bytes
        saving_pct = round(max(0, (1 - last_snap / baseline)) * 100, 1) if baseline and last_snap else 0
        return dict(
            mut_size=mut_bytes, imm_size=imm_bytes, mut_data=mut_count * per, imm_data=imm_count * per,
            mut_count=mut_count, imm_count=imm_count,
            query_p50=round(p50, 3), query_p95=round(p95, 3),
            queries_tracked=len(s.query_latencies),
            sync_avg_ms=avg_sync, sync_count=len(s.sync_durations),
            last_snap_bytes=last_snap, full_baseline_bytes=baseline,
            sync_saving_pct=saving_pct,
        )
    def remember(s, kind, x, y, moving=False):
        what = "Forklift crossing" if moving else "Pallet blocking"
        text = (f"{what} the {where(x, y)} aisle at ({x},{y}) on the way to the {where(*s.goal)} zone; rerouted around it" if kind == "blocked"
                else f"Obstacle in the {where(x, y)} area at ({x},{y}) is gone; the way is clear")
        now = time.time(); p = dict(kind=kind, x=x, y=y, moving=moving, ts=now, synced_at=now, text=text, sources=[s.id], count=1, history=[], links=[])
        s.mut.update(UpdateOperation.upsert_points([Point(y * N + x, {"space": CELL[y * N + x], "text": text_embed(text)}, p)])); s.refresh(); s.say("✎ wrote memory: " + text)
    def blocked_hits(s, pos, k=8):   # moving hazards (forklifts) are only trusted for TTL seconds: memory confidence decays
        ok = lambda p: p["kind"] == "blocked" and not (p.get("moving") and time.time() - p["ts"] > TTL)
        return [h for h in s.q(CELL[pos[1] * N + pos[0]], "space", k) if ok(dict(h.payload))]
    def cost_map(s):
        if not any(m["kind"] == "blocked" for m in s.mem): return None
        c = np.zeros(N * N); bl = [(m["x"], m["y"]) for m in s.mem if m["kind"] == "blocked"]
        for i in range(N * N):   # one Qdrant Edge similarity search per nearby cell
            if not any(max(abs(i % N - bx), abs(i // N - by)) <= 4 for bx, by in bl): continue
            b = s.blocked_hits((i % N, i // N)); sc = b[0].score if b else 0
            if sc > 0.35: c[i] = 1e6 if sc > 0.98 else 0.15 * sc   # remembered cell = wall; neighbours only break ties (never a detour)
        return c
    def plan(s):
        rec = [h for h in s.blocked_hits(s.pos) if h.score > 0.35][:3]
        if rec: s.say(f"🔎 spatial recall: {len(rec)} similar memories near {s.pos}, best match {rec[0].score:.2f}")
        sem = [h for h in s.q(text_embed(f"obstacle blocking the aisle near the {where(*s.pos)} zone on the way to the {where(*s.goal)} zone"), "text", 6) if dict(h.payload)["kind"] == "blocked"][:1]
        if sem: s.say(f"📚 semantic recall ({EMB['src']}, {sem[0].score:.2f}): \"{dict(sem[0].payload)['text'][:70]}…\"")
        raw = astar(s.pos, s.goal); cm = s.cost_map(); s.path = astar(s.pos, s.goal, cm)
        s.explain = dict(pos=list(s.pos), raw=len(raw), mem=len(s.path), cost=[round(float(x), 1) for x in cm] if cm is not None else [],
            hits=[dict(id=h.id, score=round(h.score, 2), text=dict(h.payload)["text"], sources=dict(h.payload)["sources"]) for h in rec],
            sem=[dict(id=h.id, score=round(h.score, 2), text=dict(h.payload)["text"]) for h in sem])
        if len(s.path) > len(raw): s.say(f"🧠 memory changed the route: {len(s.path)} steps vs {len(raw)} for raw A*")
    def begin(s):
        raw = astar(s.pos, s.goal); s.raw_hits = sum(c in DYN for c in raw)
        tc = np.zeros(N * N)
        for c in DYN: tc[c[1] * N + c[0]] = 1e6
        s.opt = len(astar(s.pos, s.goal, tc)) or len(raw)
        s.ghost_path, s.ghost_pos, s.ghost_trail, s.ghost_hits, s.ghost_done = list(raw), s.pos, [s.pos], 0, False
        s.mem0 = len(s.mem); s.inh0 = sum(1 for m in s.mem if set(m["sources"]) != {s.id}); s.running = True
        s.say(f"▶ mission {s.mission + 1} {s.start}→{s.goal}: {s.mem0} memories known ({s.inh0} inherited); naive route would meet {s.raw_hits} obstacles")
    def ghost_tick(s):   # the "ghost": replays the raw A* route with no memory and no replanning, so it walks straight into obstacles the real robot avoided
        if s.ghost_done or not s.ghost_path: return
        c = s.ghost_path.pop(0)
        if c in DYN: s.ghost_hits += 1
        s.ghost_pos = c; s.ghost_trail.append(c); del s.ghost_trail[:-40]
        if c == s.goal or not s.ghost_path: s.ghost_done = True
    def tick(s):
        s.ghost_tick()
        if s.done: return
        if not s.path:
            s.plan()
            if not s.path: s.done, s.running = True, False; return
        for m in s.mem:   # sensor (radius 2) notices remembered obstacles that have moved away
            if m["kind"] == "blocked" and max(abs(m["x"] - s.pos[0]), abs(m["y"] - s.pos[1])) <= 2 and (m["x"], m["y"]) not in DYN:
                s.remember("clear", m["x"], m["y"]); s.path = []; auto(s); return
        n = s.path[0]
        if n in DYN:
            s.hits += 1; s.replans += 1; s.remember("blocked", *n, moving=n not in PALLETS); s.path = []; auto(s); s.plan(); return
        s.pos = n; s.path.pop(0); s.trail.append(n); s.steps += 1
        if n == s.goal:
            s.done, s.running = True, False
            s.runs.append(dict(opt=s.opt, eff=round(min(1, s.opt / max(s.steps, 1)) * 100), mission=s.mission + 1, mem0=s.mem0, inh0=s.inh0, raw_hits=s.raw_hits, hits=s.hits, steps=s.steps))
            s.say(f"✔ goal reached: {s.steps} steps, {s.hits} obstacle hits (naive route: {s.raw_hits})")

TTL = 8.0
SEED, PALLETS, FORKS = [0], set(), []
def gen_world(seed=None):
    seed = int(seed) if seed else secrets.randbelow(90000) + 10000; rnd = random.Random(seed); SEED[0] = seed
    for _try in range(60):
        ra, ca = rnd.choice([1, 5, 6, 7, 8, 9, 13]), rnd.choice([1, 6, 7, 8, 13]); fl = rnd.random() < .5; fv = rnd.random() < .5
        a = ((0, ra), (14, ra)) if fl else ((14, ra), (0, ra)); b = ((ca, 14), (ca, 0)) if fv else ((ca, 0), (ca, 14))
        c = ((0, rnd.randint(0, 2)), (14, rnd.randint(12, 14))); d = ((14, rnd.randint(0, 2)), (0, rnd.randint(12, 14)))
        MISSIONS.update(A=[a, b], B=[b, a], C=[c, d], D=[d, c]); ends = {p for m in (a, b, c, d) for p in m}
        pal = {(ca, ra)}   # the two crossing lanes always share one hazard, so both robots discover the same cell and the fleet must merge it
        for m in (a, b, c, d):   # two random hazards on each lane's straight route, plus a few anywhere: never the same twice
            path = astar(*m)
            for cell in rnd.sample(path[2:-2], 2): pal.add(cell)
        free = [(x, y) for x in range(N) for y in range(N) if (x, y) not in SHELF and (x, y) not in ends and (x, y) not in pal]
        pal |= set(rnd.sample(free, 3))
        blk = np.zeros(N * N)
        for p in pal: blk[p[1] * N + p[0]] = 1e6
        if not all(astar(*m, blk) for ms in MISSIONS.values() for m in ms): continue
        FORKS.clear()
        for horiz in (True, False):
            for _t in range(30):
                k = rnd.choice([1, 5, 9, 13] if horiz else [1, 6, 8, 13]); o = rnd.randint(0, 8)
                seg = [(o + i, k) if horiz else (k, o + i) for i in range(6)]
                if all(q not in SHELF and q not in pal and q not in ends for q in seg): FORKS.append(dict(path=seg + seg[-2:0:-1], i=rnd.randrange(10))); break
        PALLETS.clear(); PALLETS.update(pal); refresh_dyn(); return seed
    raise RuntimeError("could not generate a solvable warehouse")
def refresh_dyn(): DYN.clear(); DYN.update(PALLETS); DYN.update(f["path"][f["i"] % len(f["path"])] for f in FORKS)
def world_tick():
    for f in FORKS: f["i"] += 1
    refresh_dyn()
gen_world()
ROB = {"A": Robot("A"), "B": Robot("B"), "C": Robot("C"), "D": Robot("D")}
def auto(r):
    if r.online: r.want_sync = True

def gate(r):   # the ONLY way to touch the fleet server: refuses while offline, counts every uplink
    if not r.online: raise HTTPException(409, "offline: uplink blocked")
    r.uplink += 1

def pull_snapshot(r):   # Qdrant Edge partial-snapshot sync into the immutable shard
    gate(r)
    resp = requests.post(f"{QURL}/collections/{COL}/shards/0/snapshot/partial/create", headers=HDR, json=r.imm.snapshot_manifest(), stream=True, timeout=60)
    resp.raise_for_status()
    snap_bytes = 0
    with tempfile.TemporaryDirectory(dir=r.idir) as td:
        f = os.path.join(td, "partial.snapshot")
        with open(f, "wb") as fh:
            for ch in resp.iter_content(1 << 16): fh.write(ch); snap_bytes += len(ch)
        try: r.imm.update_from_snapshot(f)
        except Exception as ex:
            if "failed to read directory" not in str(ex): raise   # an empty partial snapshot = already up to date; anything else is a real error
    r.sync_snap_bytes.append(snap_bytes)

def measure_full(r):   # size of a FULL re-download = partial snapshot against an empty manifest (measured, not assumed)
    if r.full_bytes and time.time() - r.full_at < 45: return
    gate(r)
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
        sh = EdgeShard.create(td, econf())
        resp = requests.post(f"{QURL}/collections/{COL}/shards/0/snapshot/partial/create", headers=HDR, json=sh.snapshot_manifest(), stream=True, timeout=60)
        resp.raise_for_status(); r.full_bytes = sum(len(c) for c in resp.iter_content(1 << 16)); r.full_at = time.time()
        try: sh.close()
        except Exception: pass

CHAOS = {"on": False, "latency": 0, "loss": 0}   # network chaos injected into every uplink sync
def sync(r, announce=False):
    gate(r); r.sync_until = time.time() + 1.2
    sync_t0 = time.perf_counter()
    try:
        if CHAOS["on"]:
            time.sleep(CHAOS["latency"] / 1000)
            if random.random() * 100 < CHAOS["loss"]:
                raise Exception(f"chaos: packet loss — sync dropped ({CHAOS['loss']}% configured, {CHAOS['latency']}ms latency)")
        report, pushed = [], set(); stamp = time.time()
        for rec in r.mut.scroll(ScrollRequest(limit=500, with_payload=True, with_vector=True))[0]:   # 1) push local writes, server merges
            pl = dict(rec.payload)
            if merge(rec.id, {k: list(v) for k, v in dict(rec.vector).items()}, pl, report): pushed.add(rec.id); ev("push", r.id, f"↑ Robot {r.id} pushed: {pl['text']}")
        before = {i: p for i, p in ((x.id, dict(x.payload)) for x in r.imm.scroll(ScrollRequest(limit=500, with_payload=True, with_vector=False))[0])}
        pull_snapshot(r); measure_full(r)                                                                      # 2) pull merged fleet state (partial snapshot)
        r.mut.update(UpdateOperation.delete_points_by_filter(Filter(must=[FieldCondition(key="synced_at", range=RangeFloat(lte=stamp))])))   # 3) local writes are now in the fleet
        after = {x.id: dict(x.payload) for x in r.imm.scroll(ScrollRequest(limit=500, with_payload=True, with_vector=False))[0]}
        new = [i for i, p in after.items() if before.get(i) != p and not (i in pushed and p["sources"] == [r.id])]
        if pushed or new or report: FCACHE[:] = [dict(q.payload) for q in FLEET.scroll(COL, limit=2000, with_payload=True)[0]]
        r.refresh()
        if new: r.path = []; r.say(f"⇣ pulled {len(new)} fleet entries via Edge snapshot (inherited knowledge)")
        for i in new: ev("pull", r.id, f"↓ Robot {r.id} pulled: {after[i]['text']}")
        for x in report: ev("merge", r.id, x["type"], **x)
        if announce: ev("sync", r.id, f"Robot {r.id} synced: pushed {len(pushed)}, pulled {len(new)}")
        r.sync_durations.append((time.perf_counter() - sync_t0) * 1000)
    except HTTPException: raise
    except Exception as ex: r.say(f"⚠ uplink error: {ex}"); ev("info", r.id, f"⚠ Robot {r.id} sync failed: {ex}")

# ---------- API ----------
from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse
SPEED = [1.0]
@asynccontextmanager
async def lifespan(_app):
    async def bg(r):
        try: await asyncio.to_thread(sync, r, r.announce)
        except Exception: pass
        finally: r.syncing = False
    async def loop():
        n = 0
        while True:
            await asyncio.sleep(0.18 / SPEED[0]); n += 1
            for r in list(ROB.values()):
                if r.syncing: continue
                if r.running: r.tick()
                if r.online and (r.want_sync or n % 45 == 0):
                    r.syncing, r.want_sync = True, False; asyncio.create_task(bg(r)); r.announce = False
            if n % 4 == 0: world_tick()
    asyncio.create_task(loop())
    yield
app = FastAPI(lifespan=lifespan)
def state_payload():
    return dict(fleet=FCACHE, events=EV[-100:], backend=dict(fleet="Qdrant server", edge="Qdrant Edge (mutable + snapshot shard per robot)", embed=EMB["src"]),
        chaos=CHAOS,
        robots={i: dict(pos=r.pos, start=r.start, goal=r.goal, trail=r.trail, path=r.path, online=r.online, status=r.status(), steps=r.steps, hits=r.hits,
            replans=r.replans, done=r.done, running=r.running, uplink=r.uplink, log=r.log, mem=r.mem, runs=r.runs, mission=r.mission, vitals=r.vitals(), explain=r.explain,
            ghost=dict(pos=r.ghost_pos, trail=r.ghost_trail, hits=r.ghost_hits, done=r.ghost_done, remaining=len(r.ghost_path))) for i, r in ROB.items()},
        dyn=[list(d) for d in DYN], world=dict(seed=SEED[0], pallets=[list(p) for p in sorted(PALLETS)], forks=[list(f["path"][f["i"] % len(f["path"])]) for f in FORKS]))
@app.get("/api/state")
async def state(): return state_payload()
@app.get("/api/stream")
async def stream():   # server-sent events: pushes the full state ~5x/sec, the UI no longer polls
    async def gen():
        while True:
            yield f"data: {json.dumps(state_payload())}\n\n"
            await asyncio.sleep(0.2 / SPEED[0])
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
@app.post("/api/{rid}/run")
async def run(rid: str): r = ROB[rid]; (r.reset_run() if r.done else None); r.begin() if not r.running else None; return {}
@app.post("/api/{rid}/pause")
async def pause(rid: str): ROB[rid].running = False; return {}
@app.post("/api/{rid}/mission/{i}")
async def mission(rid: str, i: int): ROB[rid].set_mission(i); return {}
@app.post("/api/{rid}/rerun")
async def rerun(rid: str): ROB[rid].reset_run(); return {}
@app.post("/api/{rid}/online/{on}")
async def online(rid: str, on: int):
    r = ROB[rid]; r.online = bool(on)
    r.say("📡 connectivity restored: syncing" if on else "📴 offline: memory is local only")
    if on: r.want_sync = r.announce = True
    return {}
@app.post("/api/{rid}/wipe")
async def wipe(rid: str):
    ROB[rid] = Robot(rid); return {}
@app.post("/api/speed/{x}")
async def speed(x: float): SPEED[0] = x; return {}
class ChaosBody(BaseModel): on: bool; latency: int = 0; loss: int = 0
@app.post("/api/chaos")
async def chaos_ep(body: "ChaosBody"):
    CHAOS.update(on=body.on, latency=max(0, min(3000, body.latency)), loss=max(0, min(90, body.loss)))
    ev("info", "-", f"🌩 network chaos {'ON · '+str(CHAOS['latency'])+'ms latency · '+str(CHAOS['loss'])+'% loss' if body.on else 'OFF'}")
    return {}
@app.post("/api/obstacle-moved")
async def moved():  # scenario: a random pallet is removed from the warehouse; robots only find out by sensing it
    if PALLETS: p = random.choice(sorted(PALLETS)); PALLETS.discard(p); refresh_dyn(); ev("info", "-", f"Warehouse changed: pallet at {p} was removed. Robots only find out by sensing it.")
    return {}
@app.post("/api/spawn")
async def spawn():  # a brand-new pallet drops on a random robot's route while it is driving
    r = random.choice(list(ROB.values())); cells = [c for c in (r.path or astar(r.pos, r.goal))[1:-1] if c not in DYN]
    if cells: c = random.choice(cells); PALLETS.add(c); refresh_dyn(); ev("info", "-", f"⚠ New pallet dropped at {c} on Robot {r.id}'s route")
    return {}
@app.post("/api/reset")
async def reset(seed: int = 0):
    gen_world(seed or None); EV.clear(); fleet_init()
    for k in ROB: ROB[k] = Robot(k)
    return {}

from pydantic import BaseModel
class Ask(BaseModel): q: str
CHAT_MODEL = os.environ.get("OLLAMA_CHAT_MODEL", "llama3.2:3b")
def ask(r, question):
    """Answer ONLY from this robot's local Edge memory (both shards). No fleet call, works offline."""
    coords = [(int(a), int(b)) for a, b in re.findall(r"\b(\d{1,2})\s*,\s*(\d{1,2})\b", question) if int(a) < N and int(b) < N]
    hits = {}
    if coords:
        for x, y in coords[:2]:
            for h in r.q(CELL[y * N + x], "space", 4):
                if h.score >= NEAR: hits.setdefault(h.id, h)
    else:
        for h in r.q(text_embed(question), "text", 4):
            if h.score >= 0.35: hits.setdefault(h.id, h)
    hits = list(hits.values())
    if not hits:
        where_ = f"near {coords[0]}" if coords else "about that"
        return dict(answer=f"I don't know. My local memory has nothing {where_}.", cites=[], model=None)
    P = lambda h: dict(h.payload)
    ctx = "\n".join(f"[#{h.id}] {P(h)['text']} (kind {P(h)['kind']}, seen by {'+'.join(P(h)['sources'])}, match {h.score:.2f})" for h in hits)
    try:
        j = requests.post(OLLAMA + "/api/chat", timeout=90, json=dict(model=CHAT_MODEL, stream=False, options=dict(temperature=0), messages=[
            dict(role="system", content="You are a warehouse robot. Answer ONLY from the memory lines given. Cite ids like [#12]. If they do not answer the question, say you don't know. Be brief."),
            dict(role="user", content=f"Memories:\n{ctx}\n\nQuestion: {question}")])).json()
        return dict(answer=j["message"]["content"].strip(), cites=[h.id for h in hits], model=CHAT_MODEL)
    except Exception:
        return dict(answer="From my memory: " + " ".join(f"{P(h)['text']} [#{h.id}]." for h in hits[:2]), cites=[h.id for h in hits], model="template (Ollama chat unavailable)")
@app.post("/api/{rid}/ask")
async def ask_ep(rid: str, body: Ask): return await asyncio.to_thread(ask, ROB[rid], body.q)

def bench_footprint(n=2000):   # pure measurement on scratch shards: does not touch the robots
    rng = np.random.default_rng(0); vecs = rng.random((n, DIM)); out = {}
    for name, dt, bpv in (("Float32", None, 4), ("Float16", VectorStorageDatatype.Float16, 2)):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
            sh = EdgeShard.create(td, EdgeConfig(vectors={"space": EdgeVectorParams(size=DIM, distance=Distance.Cosine, **({"datatype": dt} if dt else {}))}))
            sh.update(UpdateOperation.upsert_points([Point(i, {"space": v.tolist()}, {"i": i}) for i, v in enumerate(vecs)]))
            lat, ok = [], 0
            for i in range(60):
                t = time.perf_counter(); h = sh.query(QueryRequest(limit=1, query=Query.Nearest(vecs[i].tolist(), using="space")))
                lat.append((time.perf_counter() - t) * 1000); ok += bool(h and h[0].id == i)
            out[name] = dict(disk_kb=_dir_size(td) // 1024, vector_kb=n * DIM * bpv // 1024, p50_ms=round(sorted(lat)[len(lat) // 2], 3), top1_ok=f"{ok}/60")
            try: sh.close()
            except Exception: pass
    a, b = out["Float32"], out["Float16"]
    return dict(points=n, **out, disk_saving_pct=round((1 - b["disk_kb"] / max(a["disk_kb"], 1)) * 100, 1))
@app.post("/api/footprint")
async def footprint_ep(): return await asyncio.to_thread(bench_footprint)
dist = os.path.join(HERE, "dist")
if os.path.isdir(dist): app.mount("/", StaticFiles(directory=dist, html=True), name="web")
if __name__ == "__main__":
    import uvicorn; print("FleetMind: http://localhost:8000"); uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
