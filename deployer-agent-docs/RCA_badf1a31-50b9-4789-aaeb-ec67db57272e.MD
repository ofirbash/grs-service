# Performance Baseline — lab.bashari.co (bashari-lab-direct)

Active run: `badf1a31-50b9-4789-aaeb-ec67db57272e` · tier_0 · DB `bashari-lab-direct-bashari_erp` (Emergent-managed Mongo Atlas). Read-only investigation, no code/deploy changes made.

## 1. Backend pod resources (tier_0 "Starter")
- CPU: request 50m, **limit 250m**
- Memory: request 200Mi, **limit 512Mi**
- Replicas: 2 (fixed — HPA and VPA disabled)
- Ephemeral storage: 1Gi
- **Live memory/CPU usage, restarts, and OOM events: COULD NOT be collected.** `get_pod_events` failed twice with `kubectl_failed: cluster deployment-cluster-05: cluster not found`. No restart/OOM signal is retrievable through current tooling. There is no evidence of OOM, but it could not be positively ruled out. (A platform operator with cluster access can pull `kubectl top pod` / describe for this.)

## 2. Database location / latency
- DB: Emergent-managed MongoDB Atlas, db `bashari-lab-direct-bashari_erp`.
- **Pod→DB ping RTT and same-region vs remote: COULD NOT be measured.** No tool executes inside the backend pod, and the eph sandbox has no DB credentials, so an in-pod `ping`/round-trip measurement is not possible from this toolset. `mongo_query` runs server-side from the MCP host, not from the app pod, so its timing is not representative of pod→DB latency. Backend image is in AWS `us-west-2` ECR; Atlas region is not exposed to tooling. This needs to be measured from inside the pod (e.g. a timed `find_one`/`ping` from the FastAPI process).

## 3. Collection document counts
| Collection | Count |
|---|---|
| jobs | 105 |
| shipments | 23 |
| clients | 108 |
| branches | 6 |
| activity_log | 1366 |
| users | 23 |
| pricing_config | 1 |

- **Total stones across all 105 jobs: 245** (computed by summing `total_stones`). Average ≈ 2.3 stones/job. Distribution: 56 jobs have 1 stone, 22 have 2, down to a long tail; only 5 jobs have ≥9 stones.
- **Largest job doc: job #537 — 15 stones, full `verbal_findings` per stone — ≈ 6.5 KB serialized.**
- **Average job doc size ≈ 1–2 KB** (estimated; `$collStats`/aggregate is not available through the read-only query tool). Whole `jobs` collection ≈ 150–200 KB. **Data volume is tiny.**

## 4. Indexes
- **jobs: only `_id_`**
- **shipments: only `_id_`**
- **clients: only `_id_`**
- No secondary indexes exist on any of the three collections.

## 5. Endpoint response times
- **Not available from logs.** The backend emits plain uvicorn access lines (`"GET /api/jobs HTTP/1.1" 200 OK`) with **no duration field**, so per-request latency cannot be read from logs.
- Direct probes of the live URL returned **401 (auth required)** on every endpoint, so the measured times reflect only the pre-handler auth-rejection path, NOT the real query cost:
  - `/api/jobs` 564 ms (first/cold hit), `/api/pricing` 155 ms, `/api/dashboard/stats` 127 ms, `/api/shipments` 128 ms, `/api/clients` 105 ms.
  - These are NOT representative of the authenticated N+1 query cost. Authenticated timing needs a logged-in request (add timing middleware or capture from browser DevTools).

## Which factor dominates: code vs data volume vs infrastructure
**The code-level N+1 query pattern is clearly the dominant factor — not data volume, and not (on available evidence) infrastructure.**

- `GET /api/jobs` fans out to: 1 query returning all 105 jobs + 3 `find_one` per job (client, branch, shipment) + a shipments query ≈ **316+ sequential DB round-trips per call**. All three lookup collections have only the `_id` index.
- Dashboard and shipments screens call the same `/api/jobs` builder, so one screen switch can trigger this fan-out multiple times. The logs show `/api/jobs` is by far the most frequently hit endpoint, repeatedly.
- Even at a modest 20–40 ms per round-trip, 316 sequential calls = **6–13 s**, which matches the reported 10+ s screen switches. If the DB is remote/cross-region (unconfirmed — see #2), each round-trip pays that RTT and the N+1 cost multiplies accordingly.
- **Data volume is negligible** (105 jobs, 245 stones, ~0.2 MB) — it is not the cause.
- **Infrastructure:** tier_0 is small (512Mi / 250m CPU) but the dataset is tiny; there is no evidence memory is the bottleneck, and a tier upgrade would NOT fix a latency driven by hundreds of sequential round-trips. Live usage/OOM could not be confirmed (#1), so infra is "not evidenced as the cause," not "positively cleared."

## Recommended fixes (for E1 / next code change)
1. **Eliminate the N+1 in `GET /api/jobs`:** collect the distinct `client_id`, `branch_id`, and shipment ids across the loaded jobs and batch-fetch with a single `$in` query each (or build in-memory lookup maps), instead of 3 `find_one` per job. This collapses ~316 round-trips to ~4.
2. **Stop the dashboard and shipments pages from re-invoking the full jobs builder** — give them purpose-built aggregates/endpoints rather than reusing `/api/jobs`.
3. **Add indexes** on the fields actually used for the per-job lookups and any list filters/sorts (e.g. on `jobs` for status/created_at, and confirm the client/branch/shipment lookups hit `_id`). Low impact at current volume, but correct for growth.
4. Add request-timing middleware so authenticated per-endpoint latency is observable going forward.
5. (Ops, separate) Measure pod→Atlas RTT from inside the pod to confirm whether cross-region latency is amplifying the N+1; and get live pod memory/restart/OOM once cluster access is available.
