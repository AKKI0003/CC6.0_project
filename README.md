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
