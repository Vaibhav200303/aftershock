# Development guide

This guide covers the pieces of the code you need to change the simulation, the model
providers, the on-chain program or the web app. For installing and running the app, see the
[README](../README.md).

## Repository map

| Path | What lives there |
| --- | --- |
| `backend/src/server.mjs` | HTTP server and routes, run lifecycle (start/stop/pause), managed validator, headless mode and its invariant report |
| `backend/src/world.mjs` | the round loop: decisions, shifts, meals, fires, rot, houses, the bank, market clearing, metrics |
| `backend/src/tools.mjs` | the tools an agent may call, how each is validated, and the text it gets back |
| `backend/src/config.mjs` | every default (`CFG`), the goods list, `.env` loading |
| `backend/src/tunables.mjs` | the dials the panel can move, which apply live, and the scenario presets |
| `backend/src/chain.mjs` | Solana bridge: hand-encoded instructions, ledger decoding, purses, the token |
| `backend/src/brains/` | `stub.mjs` (scripted villagers), `providers.mjs` (provider table), `chat.mjs` (shared decision loop), `prompt.mjs` (system prompt) |
| `backend/scripts/` | validator, chain checks, provider check, run analysis, devnet deployment |
| `backend/public/index.html` | standalone dashboard, served when `web/` has not been built |
| `chain/programs/chain/src/lib.rs` | the Anchor program: ledger, batch auction, bank, SPL token |
| `chain/prebuilt/` | built program (`chain.so`) and its IDL (`chain.json`), as the Docker image uses them |
| `web/src/` | React app: `island/` (three.js scene), `admin/` (panel, agent log, swarm graph), `store.js` (state and SSE), `KeyGate.js` (hosted-mode key entry) |
| `frontend/` | standalone island page, served when `web/` has not been built |

## A round

1. **Decide.** Every agent gets an observation (its holdings, prices, what is wanted, what
   each job is worth to it) and answers by calling tools. The round waits until
   `DECIDE_QUORUM` of agents have answered or `DECIDE_TIMEOUT_MS` passes. An agent that
   misses the deadline keeps its last job and posts no orders.
2. **Work.** Each agent works one shift. Skills and learning-by-doing set the yield.
3. **Live.** Meals are eaten, fires burn wood, food rots, house upkeep is paid, and building
   progress is added.
4. **Settle.** Goods changes are queued as deltas and sent to the program with the round's
   orders. Each good clears in one uniform-price batch auction, and cash moves between the
   agents' token accounts.
5. **Read back.** The backend replaces its local state with the ledger it reads from the
   chain. The chain is the source of truth.

Every event is written to `runs/<timestamp>/events.jsonl`, with `meta.json` at the start
and `final.json` on stop.

## Model providers

`backend/src/brains/providers.mjs` holds one entry per provider: endpoint, key variable,
default model, prices per million tokens, and request parameters. Every provider except
Anthropic speaks the OpenAI chat-completions format and shares the decision loop in
`chat.mjs`.

To add a provider:

- **No code:** set `PROVIDER=foo`, `FOO_BASE_URL`, `FOO_API_KEY` and `MODEL` in `.env`. Add
  `FOO_PRICE=in,out` if you want the run costed.
- **In code:** add an entry to `PROVIDERS`.

Then check it on its own, without a chain:

```bash
PROVIDER=foo AGENTS=3 backend/scripts/check-brain.sh
```

The stub brain (`PROVIDER=stub`) needs no key and plays fixed habits. Use it to exercise
the chain, the market and the UI for free.

## Dials

`backend/src/tunables.mjs` is the single list of dials. Each one has a key (a path into
`CFG`), a range, and a flag saying whether it applies live or only from the next run. To add
a dial:

1. Add the default to `CFG` in `config.mjs`.
2. Read it from `CFG` at the point of use, not at import time, so a change takes effect on
   the next round.
3. Add an entry to `tunables.mjs`.

The panel, `GET/POST /tunables`, `DIALS=` and `SCHEDULE=` all pick it up from there.

## The on-chain program

The program lives in `chain/programs/chain/src/lib.rs`. Its instructions are `initialize`,
`borrow`, `repay`, `collect`, `pay_dividend`, `init_purses`, `settle_cash`, `settle` and
`clear_auction`. `backend/src/chain.mjs` encodes these by hand and decodes the ledger by
hand, so **any layout change in `lib.rs` must be mirrored in `chain.mjs`**.

The toolchain is set in `chain/rust-toolchain.toml` (Rust 1.89.0). After editing the
program, rebuild it and refresh the prebuilt copy:

```bash
cd chain && anchor build
cd programs/chain && cargo build-sbf --arch v0 --sbf-out-dir ../../prebuilt
cp ../../target/idl/chain.json ../../prebuilt/chain.json
```

The validator loads `chain/target/deploy/chain.so` at genesis, at the address in the IDL.
If the validator is running an outdated `chain.so`, the ledger decodes as garbage and every
settle is refused. When nothing trades and every chart except GDP sits flat, check this
first.

`backend/scripts/deploy-devnet.sh` and `devnet-demo.mjs` put the program and a scripted
village on devnet. The live simulation needs more requests per second than devnet's public
RPC allows.

## Web app

```bash
npm --prefix web install
npm run web:dev          # Vite on http://localhost:5183
```

The dev server proxies `/state`, `/agent`, `/tunables`, `/start`, `/stop`, `/pause`,
`/resume` and `/events` to the backend at `http://127.0.0.1:8787`. Set `BACKEND=<url>` to
point it somewhere else. `npm run web:build` writes `web/dist`, which the backend serves
whenever it exists.

## Checking changes

There is no unit-test runner. Use the checks below, from cheapest to most thorough:

```bash
npm --prefix web run build                         # frontend compiles
PROVIDER=openai AGENTS=3 backend/scripts/check-brain.sh # an LLM provider answers with tool calls (not for stub)
backend/scripts/check-salt.sh                  # token supply matches the books after every money-moving instruction
backend/scripts/check-purses.sh                    # agents hold and pay in their own token accounts
RUN_ROUNDS=20 AGENTS=10 PROVIDER=stub OPEN_BROWSER=0 npm start   # needs a validator: prints every ledger invariant
```

A headless run must end with every invariant `ok`. Run it against a validator you started
yourself (`MANAGED_VALIDATOR=0`), because the summary reads the ledger after the run stops.

After a run, these scripts read what happened:

- `backend/scripts/analyze.mjs runs/<dir>` summarises a run.
- `macro.mjs` shows the run as a table by round window.
- `trace.mjs --agent <name>` follows one villager's decisions.
- `compare.mjs runs/<a> runs/<b>` sets runs side by side.

## Line endings

`.gitattributes` pins every text file to LF. Scripts under `backend/scripts/` fail under
bash if they have CRLF endings, so keep `core.autocrlf` from converting them on Windows.
