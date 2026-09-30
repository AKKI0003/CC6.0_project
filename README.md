# FleetMind (Qdrant Edge)
Each robot has two Qdrant Edge shards: mutable (local writes) and immutable (fleet copy pulled via partial snapshots).
The fleet is a Qdrant server collection ("fleetmind_memory", recreated on every start). Vectors: "space" (grid) + "text" (Ollama all-minilm).

Setup: copy server/.env.example to server/.env and set QDRANT_URL (+ QDRANT_API_KEY for Cloud).
Run:   cd server && pip install -r requirements.txt && python main.py   -> http://localhost:8000
Ollama optional: `ollama pull all-minilm` and keep Ollama running; otherwise a hash fallback is used (shown in the header chip).
Rebuild UI: cd web && npm install && npm run build

## Added in this version
- Edge Vitals per robot: measured query latency p50/p95, logical data size vs disk, sync duration, partial snapshot bytes vs a MEASURED full re-download.
- "Why this route?" panel + memory cost heatmap, and "Ask Robot" (answers only from that robot's local Edge memory; llama3.2:3b via Ollama, template fallback). Set OLLAMA_CHAT_MODEL in .env to change the model.
- Footprint benchmark (Float32 vs Float16 vector storage) on scratch shards; KPI strip computed from live data.

## v4: 3D world, minimap, random hazards
- 3D warehouse (three.js): racks, pallets, patrolling forklifts, four robots, a fleet-memory tower; memory packets fly robot <-> tower on sync. Orbit with the mouse; 3D / Top / Follow buttons.
- Minimap (2D) shows the selected robot's own knowledge (learned / inherited / cleared).
- Every "New world" (or Judge Mode) generates a random warehouse: pallets are placed by chance, two forklifts patrol random aisles, lanes are random. The world seed is shown in the header and can be re-entered under the ... menu to reproduce a run.
- Planner: remembered obstacles are walls and A* is optimal, so a robot always takes the shortest route it knows. Route efficiency = ideal length with full knowledge / steps actually driven. Forklift memories decay after 8 s.
- ... menu: New world (seed), drop a pallet on a route, remove a random pallet, network chaos.

## v5: premium industrial redesign
Visual-only redesign — no simulation, state, or API logic changed. Same components, same event handlers, same data flow.
- Palette: graphite/charcoal background, warm amber as the single accent (replaces the blue/purple "AI" look). Green = online, red = offline, amber = syncing — same meaning as before, calmer execution.
- Typography: Inter for UI text, JetBrains Mono reserved for coordinates/ids/logs/telemetry only.
- Floating "island" navigation replaces the old top bar.
- Telemetry moved into a single strip; controls grouped into labelled clusters (Mission / View / History / Connection); no emoji.
- Memory / Fleet / Results are one bordered console split by thin dividers instead of three separate glowing cards.
- 3D: robots redesigned as a flatter industrial chassis with a floating "ROBOT X" tag; every robot now has an explicit amber START pad and a green GOAL beacon, each labelled — previously only an unlabelled, robot-colored goal ring existed and start had no marker at all.
- Reduced bloom/glow throughout (halos, sync rings, memory markers, particles) and switched them from purple to amber/green/steel-blue.

## v6: full product website (landing + scroll story + redesigned console)
Presentation-layer rewrite only. Backend, simulation, memory/merge logic, and every console
feature (Judge Mode, Ask, Chaos, Footprint, Replay, Ghost run, minimap, Edge vitals) are unchanged —
same handlers, same API calls, same state shape.

New: `web/src/Landing.jsx` (marketing site), edits to `web/src/App.jsx` (Shell + redesigned Console),
`web/src/scene3d.js` (added `setPresent`/`presentAt`, camera-only, never touches OrbitControls or
robot/simulation logic), full rewrite of `web/src/style.css`. Added dependency: `lucide-react` (icons,
no emoji anywhere per the brief).

**Landing page** (`/`, client-side view, no router): floating "dynamic island" nav that compacts and
darkens over the 3D section; ivory hero; an editorial "problem" section; a 640vh scroll-driven story
(6 beats) that pins the *real* Warehouse3D scene full-bleed and moves the camera through 6 keyframes
(HERO_WIDE → ROBOT_CLOSE → OBSTACLE_DETAIL → MEMORY_TRANSFER → FLEET_WIDE → CONSOLE) as you scroll,
polling the live backend so the robots/obstacles shown are real, not staged; a light "live console"
teaser with real numbers pulled from `/api/state`; an engineering section; a minimal final CTA.
"Enter console" does a short graphite crossfade into the operational console; "Overview" returns.

**Console redesign**: replaced the old three-equal-cards layout with a single unified **mission
timeline** (built from the existing `events` the backend already returns — real timestamps, no
backend change) plus a narrower **Robot detail** panel (Memory/Why/Ask/Log tabs, unchanged
functionality) and an editorial **Results** summary (big numbers, then a slim table) instead of a
bordered card. "Advanced" is now "Engineering telemetry." Palette moved from amber-on-graphite to the
warm ivory/graphite/industrial-amber system used site-wide.

**Known simplifications vs. the brief** (documented, not hidden):
- No GSAP/Lenis — scroll-linked camera and section reveals are hand-built with `scroll` events
  (rAF-throttled) and IntersectionObserver. Lighter dependency footprint; slightly less elastic easing
  than a dedicated scroll library.
- The landing→console transition is a fast crossfade, not a single continuous WebGL canvas handoff
  (two separate `Warehouse3D` instances — safer, avoids a fragile shared-context handoff).
- No custom cursor.
- Mission timeline shows fleet/sync-level events (push/pull/merge/info), not every local
  "wrote memory" tick — those remain visible in the per-robot Memory tab, which has real content the
  timeline doesn't duplicate.
- Mobile: overlays are hidden/stacked/scrollable below 760px rather than a from-scratch mobile layout.

## v7: color scheme reverted to cyan/violet
Reverted the amber/ivory industrial palette — it read as yellowish/orange. Back to the original
dark-graphite + cyan + violet scheme: brand accent (fleet tower, Judge Mode, sync rings, merge
effects, CTA buttons) is violet; Robot A is cyan; landing "light" sections use a cool light gray
instead of warm ivory. Robots B/C/D and the semantic online/offline/warning colors are unchanged.
Only color tokens changed (style.css custom properties + scene3d.js material colors) — no layout,
component, or behavior changes.

## v8: Aurora background + full dark theme + camera fix
- Added the React Bits `Aurora` component (`web/src/Aurora.jsx` + `.css`, new dependency `ogl`) as a
  fixed, ambient WebGL gradient behind the landing page (colorStops green/lavender/violet, blend .5,
  amplitude 1, speed .5). It sits behind the hero and text sections; the 3D story and console keep
  their own opaque backgrounds so Aurora never competes with the warehouse render.
- The landing page's light "ivory/paper" sections are gone — the whole site is dark now. This required
  re-pointing the color tokens (`--ivory`, `--paper`, `--ink*`, `--line-light*`) to dark-mode values
  rather than restructuring markup, so no JSX/behavior changed.
- Full recolor to match the Aurora palette: robots are green (A), lavender (B), indigo (C), teal (D);
  the fleet tower / Judge Mode / sync rings / merge flashes / CTA buttons are all violet. Applied
  consistently across the 3D scene, the CSS design tokens, and the minimap/report/timeline colors so
  nothing was left on the old orange scheme.
- Rebuilt the landing page's scroll-driven camera path: the old keyframes swung the camera close
  enough to clip into racks (the "zoomed into a random corner" bug). New keyframes keep a generous
  radius/height at every step and orbit the warehouse smoothly, only settling close at the very end
  (which now matches the console's own opening camera exactly).
- Fixed two real bugs found while testing this pass, both CSS specificity issues where a token's
  *meaning* changed (light→dark) but one rule still used it the old way: the nav "Enter console"
  button (was invisible — text color reused the now-dark `--ivory` token) and four rgba() shadows that
  were still hardcoded to the old orange in decimal form (not caught by the hex find-replace).

## v9: live console redesign
- The 3D stage is now the console: edge-to-edge, `calc(100vh - nav)` tall, instead of a bordered box with margins.
- Overlay chrome went frameless/HUD-style: a fleet rail with an underline on the active robot, large borderless telemetry
  numbers, a single icon-based floating control dock (bottom-center, tooltips on every icon-only button), and a small
  radar-style minimap. No more per-group captions or bordered cells.
- The three stacked bottom sections (timeline / robot detail / results) plus the separate "Engineering telemetry"
  drawer are now ONE compact tabbed panel: Timeline | Robot | Results | Vitals. Same content, same components,
  a fraction of the vertical space.
- Robustness: if the SSE stream is silent for 2.5s or errors, the console falls back to polling instead of sitting on
  "Connecting..." forever.
- Not changed: every handler, API call, Judge Mode, Ask, Chaos, Footprint, Replay, Ghost run, view modes.
- Not restyled (still the previous look): the Judge Mode mission-report modal.
