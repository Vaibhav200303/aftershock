# Persistent islands and disaster memory

The Village archive button opens a parchment/teal overlay with island switching, council review, run comparisons and next-run experiment controls. Sunhaven retains the original layout. Moonharbor uses offset terraces and lanes, slate roofs, illuminated windows, street lamps and a moon, with lower raw-food/wood yield, greater smoked-fish yield and higher heating needs. Each island has its own run records and Meko datapack. One economy runs at a time; switching the viewed island does not start, stop or overwrite the active one. Cross-island trading is not implemented.

## Storage and settlement

`YUGABYTE_DATABASE_URL` enables the YSQL adapter through node-postgres. `YUGABYTE_CA_CERT` supplies the cluster CA with certificate verification enabled. The idempotent schema has runs, round metrics, and council lessons; transactions upsert checkpoints and associated round history. Solana remains the authority for settled balances. The database records observed, settled results rather than pretending that a database commit can atomically settle a Solana transfer.

Every completed round and ended run is also journaled by atomic local file replacement under `runs/.archive` (or AFTERSHOCK_DATA_DIR). Database synchronization happens off the simulation's critical path. Failed writes remain pending and retry; a restart replays the local spool. Healthy database data can restore the archive to a fresh local directory. Local-only/degraded/connected status is visible in the archive; it does not claim a cloud write succeeded when the connection failed. Older `final.json` snapshots are imported on normal startup without copying credentials from old metadata.

After a server restart, a saved active checkpoint is displayed as an ended, recovered snapshot. The application does **not** resume or replay financial operations against a reset Solana validator. A fresh village starts a new ledger; old results and their source IDs remain available. Exact process/crash continuation and concurrent island simulation require additional chain-state recovery/orchestration work.

## Memory and council

The Food keeper, Forester and Treasurer propose factual summaries of measured disaster rounds. Nothing is recalled until the player approves the exact observation. Pending and rejected items never enter agent context. The observation retains its source run, round span, reserve changes and hungry/cold agent-round counts. An observation is not a claim that a strategy worked. The HUD shows the exact recalled evidence separately from the selected action and latest public thought.

The backend uses the official MCP SDK with a server-only Meko key. Both island IDs must map to separate datapacks; agent IDs are attribution, not privacy boundaries. Only approved public village observations are sent to Meko. The implementation does not call irreversible memory promotion or upload hidden reasoning, API keys or raw model prompts. Conversation messages contain concise measured-outcome summaries.

Live tool schemas are discovered. The deployed Meko surface requires conversation IDs for memory_search and represents metadata as an optional JSON string; responses may wrap JSON inside `result`. The adapter handles these shapes. Publication is read back using a unique island/lesson marker before being marked verified. Failed/unverified publication is visible and retryable. Retrieval only accepts IDs matching the local approved catalog, then passes the canonical observation into the model request, never arbitrary foreign memory content. One shared retrieval feeds the village each round rather than fifty independent calls. With Meko unavailable, approved local observations remain usable and the HUD identifies that source honestly. Scripted agents can exercise the pipeline but do not learn from text.

## Experiments and evidence

Next experiment chooses memory recall on/off, seed, and free play / cold-snap / blight. Bounded experiments run 12 rounds, trigger the shock before round 3 and return to baseline before round 8. Free play has no test cap. Both modes record results. Run comparisons expose starting-condition fingerprints, population, provider, seed, actual shock history, food/wood, debt, GDP, hungry/cold agent-rounds and the first hunger-free/cold-free round after a shock ends. Manual changes and model nondeterminism must be considered; no improvement is assumed.

## Setup

1. Create a YugabyteDB Sandbox and allow only the app host's current public IP; download its CA and use the YSQL connection parameters.
2. Put the database URL and CA path in the ignored `.env`. Keep TLS verification enabled.
3. Create two Meko datapacks, then configure MEKO_API_KEY, MEKO_DAY_DATAPACK_ID and MEKO_NIGHT_DATAPACK_ID in the same ignored file. Credentials never enter browser bundles or Git.
4. Restart the backend. Campus networks may block outbound database port 5433 even when HTTPS dashboards and Meko work; a reachable network is required for live YSQL synchronization.

## Verification

- `node --test backend/tests/academy.test.mjs web/tests/disasters.test.mjs`: checkpoints/restart, island isolation, measured proposals, approval gating, recall-off, foreign-memory rejection, unavailable services, wrapped MCP responses and optional JSON-string metadata, and actual chat-request context injection without paid calls.
- Isolated stub integration: backend/tests/academy-integration.mjs against a separate server with NO_DOTENV=1, PROVIDER=stub, MAX_ROUNDS=4 and an isolated AFTERSHOCK_DATA_DIR (so tests do not use production sponsor accounts). Verifies disaster proposals, review, on/off context, and independent island archives. Separate checks covered restart recovery and Moonharbor baselines.
- Production Vite build and browser checks for council UI, saved history, night graphics and agent evidence.
- Sponsor integration validation and remaining network limitations are reported separately from local/mock tests; mock success is not proof of a live service.

Primary references: https://docs.yugabyte.com/stable/develop/drivers-orms/nodejs/postgres-pg-reference/ ; https://docs.mekodata.ai/reference/mcp-server/ ; https://docs.mekodata.ai/architecture/core-concepts/datapacks/ ; https://docs.mekodata.ai/architecture/core-concepts/memory/

## Live sponsor validation for this workspace

A free YugabyteDB Aeon Sandbox was created in AWS Hyderabad. The cluster CA is used for verified TLS, and access is restricted to the app computer’s hotspot IP. Direct database connections repeatedly timed out on the campus network; switching to a hotspot resolved the issue. Returning to that campus network can interrupt cloud synchronization, while local checkpoints remain available.

The live YSQL test (`node backend/tests/yugabyte-live.mjs`) passed in the isolated `aftershock_verification` schema: schema creation, transactional upserts, round history backfill, lessons and fresh-local-directory recovery. It does not alter production game tables. The actual game’s migrated run records also synchronized to the cloud.

The live Meko test (`node backend/tests/meko-live.mjs`) passed for authenticated MCP, conversation creation, memory publication/read-back and cross-datapack isolation. Its explicitly labeled verification facts are not in the app’s approved catalog and therefore cannot enter villager prompts. Separate Sunhaven and Moonharbor datapacks and one server-only key were created with user approval. All secrets are in the ignored `.env`; the CA is under ignored local tooling. These live scripts perform intentional test writes and should only be rerun when verifying integration changes.
