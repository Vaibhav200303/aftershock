# Retained village results

Stop ends the active run and aborts outstanding model requests, then preserves a detached public snapshot and per-agent logs. No live brain or runtime API key is kept in the retained results. The final snapshot is also written into the run's `final.json`. Requests to `/state` and `/agent` continue to serve the retained results until a new village successfully starts. A server restart does not automatically reload an old run.

Dashboard charts, the full agent table, inspector traits/history, island agents and price readouts remain visible. The run clock freezes. Stopped and capped runs use “Run ended” and “Run completed” labels respectively. Pause remains resumable; an ended run offers “New village” with confirmation before replacing the current results. Starting failures leave the previous results intact. The onboarding gate does not cover completed results.

The local ignored environment has MAX_ROUNDS=0; explicit limits remain supported for hosted deployments and testing.

Verification: production build and isolated stub integration tests (automatic two-round completion, retained snapshots/history/traits/logs, fixed elapsed time, replacement, Pause/Resume and manual Stop). Browser inspection verified populated stopped dashboard and island readouts and the retained agent roster. Test runs use no paid model calls.

To rerun the lifecycle integration test, launch a separate backend on port 8811 with PROVIDER=stub, MANAGED_VALIDATOR=1 and MAX_ROUNDS=2, then run `node backend/tests/retained-results.mjs`. Do not use the production/live server; the script replaces the isolated test village.
