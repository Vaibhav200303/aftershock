# Aftershock

A village economy simulation in which language-model agents work, trade, borrow and build,
while every coin and every good is settled on a local Solana validator. You watch it on a 3D
island and steer it from an admin panel by moving live economic dials: a bad fishing
season, a cold snap, a credit crunch, and so on.

## What it does

- **Agents with their own minds.** Each villager is an LLM (or a free scripted "stub")
  that, every round, chooses a shift (fish, cut wood, craft a net, smoke fish, build a
  house), posts buy and sell orders, borrows or repays, and gives a reason for each choice.
  Agents act only through tools: `gather_food`, `gather_wood`, `craft_net`, `smoke_fish`,
  `build_house`, `place_order`, `check_market`, `borrow`, `repay` and `set_lifestyle`.
- **An on-chain ledger.** An Anchor program (`chain/programs/chain`) holds every agent's
  goods, cash and debt. Each round's markets clear in uniform-price batch auctions on chain,
  and the backend reads the ledger back as the source of truth.
- **A real token.** Money is an SPL token minted only by the bank's rules. Each villager
  holds it in a token account of their own, and trades settle as transfers between them.
- **A bank.** It lends against goods, charges interest per round, collects at the deadline
  and forecloses when a loan goes unpaid. The program checks its books on every write.
- **Live dials.** About 55 tunables (`backend/src/tunables.mjs`) can be changed while a run
  is going. Presets bundle them into scenarios: baseline, bad fishing season, blight,
  cold snap, forest fire, hurricane, credit crunch, easy money and good season. Villagers
  are told about each change as a plain fact, and the charts mark the round where it landed.
- **Two views in one web app.**
  - The island (`/`): a three.js scene of the village with a live transaction feed and stats.
  - The admin panel (`/dashboard`): start/stop/pause, provider and village size, economy
    charts (GDP, prices, money, credit, wellbeing, Gini), an agent table with each
    villager's turn-by-turn log, a force-directed graph of trades, and the dial drawer.
- **Several model providers.** OpenAI, Anthropic and DeepInfra are built in, and any
  OpenAI-compatible endpoint can be added from `.env` alone.
- **Run analysis.** Every run is logged under `runs/`, and scripts summarise, compare
  and trace runs after the fact.

## Persistent islands and shared disaster experience

Open **Village archive** from either view to switch between Sunhaven and Moonharbor, review measured council observations, compare runs, and choose a memory-on/off disaster experiment. Approved observations are supplied to model agents and shown in their inspector with source evidence.

YugabyteDB stores run/checkpoint history, and Meko stores approved public disaster memories. Both have explicit connection status and a durable local fallback; configure server-only credentials using `.env.example`. One island simulation runs at a time. See [persistent islands and memory](docs/design/persistent-islands.md) for setup, tests, settlement boundaries and restart behavior.

## How it fits together

```
web/ (React + Vite + three.js)  ──HTTP/SSE──▶  backend/src/server.mjs (Node)
                                                 │  world.mjs   round loop, market, bank
                                                 │  tools.mjs   what an agent may do
                                                 │  brains/     stub + LLM providers
                                                 ▼
                                    chain.mjs ──RPC──▶ solana-test-validator
                                                       └─ chain program + SPL token
```

Each round, every agent decides at once (the round waits up to `DECIDE_TIMEOUT_MS`, or until
`DECIDE_QUORUM` of them have answered). Then everyone works one shift, eats, keeps a fire
going, and goods rot. Goods changes and the round's orders are settled on chain, and the
local state is replaced by what the chain reports.

## Requirements

Pick one of these two setups.

**Docker (any OS, including Windows):** Docker Desktop or Docker Engine. The image
installs Node 22, the Solana 2.2 validator, and a prebuilt copy of the program.

**Native (Linux, macOS or WSL):**
- Node.js 22 or newer, and npm
- Solana CLI 2.2.x (`solana`, `solana-test-validator`, `solana-keygen`), plus a keypair
  at `~/.config/solana/id.json`
- `bash` and `python3` (used by the validator script)
- Rust and Anchor only if you change the on-chain program (see `docs/development.md`)

The validator doesn't run natively on Windows. On Windows, use Docker or WSL.

## Installation

### Docker

```bash
docker build -t aftershock .
docker run --rm -p 8787:8787 aftershock
```

Open http://localhost:8787. The container starts its own validator for each run and stops
it when the run ends.

By default the image runs in *hosted* mode: it holds no API key, offers the stub brain and
OpenAI, caps a run at 100 rounds, and lets a visitor paste their own key into the page. That
key is kept in memory for one run only. To run it with your own key and every provider, see
[Configuration](#configuration).

### Native

```bash
npm --prefix backend install
npm --prefix web install
npm --prefix web run build
cp .env.example .env            # then edit it

# the program and its interface, from the prebuilt copies
mkdir -p chain/target/deploy chain/target/idl
cp chain/prebuilt/chain.so   chain/target/deploy/chain.so
cp chain/prebuilt/chain.json chain/target/idl/chain.json
```

## Running

### Native

```bash
backend/scripts/validator.sh    # terminal 1: local validator on 8899 with the program loaded
npm start                       # terminal 2: backend + built web app on http://localhost:8787
```

If port 8787 is busy, the server tries the next ports up to 8797 and prints the URL it uses.
To work on the frontend with hot reload, run `npm run web:dev` (Vite on port 5183, which
proxies the API to the backend).

### Headless

With `RUN_ROUNDS` or `RUN_SECONDS` set, a run starts right away and the server exits at the
end. On exit it prints a summary: every ledger invariant (ok/BROKEN), the token supply
against the books, bank results, GDP, wellbeing and the model cost.

```bash
RUN_ROUNDS=20 AGENTS=10 PROVIDER=stub OPEN_BROWSER=0 npm start
```

A headless run needs a validator that outlives the run, because the summary reads the
ledger after the run has stopped. In Docker, start the validator yourself and turn off the
managed one:

```bash
docker run --rm -e RUN_ROUNDS=20 -e AGENTS=10 -e HOSTED=0 -e MANAGED_VALIDATOR=0 aftershock \
  bash -c 'backend/scripts/validator.sh > /tmp/v.log 2>&1 &
           until grep -q "validator on" /tmp/v.log; do sleep 1; done
           node backend/src/server.mjs'
```

With `MANAGED_VALIDATOR=1`, the validator stops together with the run, and the summary
fails with `fetch failed`.

## Configuration

Settings come from environment variables or a `.env` file at the repository root (see
`.env.example`). For API keys, `.env` takes precedence over the shell. For everything else,
the shell wins. Set `NO_DOTENV=1` to ignore `.env`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PROVIDER` | `stub` | `stub`, `openai`, `anthropic`, `deepinfra`, or a custom name (below) |
| `MODEL` | provider default | e.g. `gpt-6-luna` for OpenAI, `openai/gpt-oss-120b` for DeepInfra |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPINFRA_API_KEY` | – | only the key for the provider you use |
| `<NAME>_BASE_URL`, `<NAME>_API_KEY`, `<NAME>_PRICE` | – | any OpenAI-compatible endpoint, with `PROVIDER=<name>` |
| `REASONING_EFFORT` | off | `low`/`medium`/`high` turns model reasoning on |
| `SERVICE_TIER` | standard | e.g. `flex` for OpenAI's cheaper, slower tier |
| `AGENTS` | 100 (`.env.example`: 30) | village size, up to the ledger's 137 |
| `SEED` | 12345 | same seed gives the same names, traits and skills |
| `DECIDE_TIMEOUT_MS` | 8000 | the longest a round waits for decisions |
| `DECIDE_QUORUM` | 0.9 | share of agents that must answer before the round proceeds |
| `START_CASH`, `START_FOOD`, `START_WOOD` | 10000 (cents), 20, 20 | each agent's starting endowment |
| `CREDIT`, `BANK_LTV`, `BANK_RATE_PER_ROUND` | on, 0.60, – | bank on/off, loan-to-value, interest per round |
| `PORT` | 8787 | HTTP port |
| `RPC` | `http://127.0.0.1:8899` | validator RPC |
| `RUN_ROUNDS`, `RUN_SECONDS` | 0 | headless run length (0 = run until stopped) |
| `DIALS` | – | dials set at birth, e.g. `TASKS.gather_wood.yield=24,BANK.RATE_PER_ROUND=0.002` |
| `SCHEDULE` | – | dials pulled mid-run, e.g. `50:CATCH=0.5;80:CATCH=1` |
| `HOSTED` | 0 | 1 = hold no key, let visitors paste one, offer only stub and OpenAI |
| `MANAGED_VALIDATOR` | 0 | 1 = the server starts and stops a validator with each run |
| `MAX_ROUNDS` | 0 | stop a run automatically after this many rounds |
| `KEEP_RUNS` | 0 | keep only the newest N saved runs (0 = keep all) |
| `OPEN_BROWSER` | on | 0 = don't open a browser tab on start |

To run the container with your own key and every provider:

```bash
docker run --rm -p 8787:8787 -e HOSTED=0 -e PROVIDER=openai -e OPENAI_API_KEY aftershock
```

`-e OPENAI_API_KEY` with no value passes the variable through from your shell, so the key
never appears in the command line.

## HTTP API

| Method and path | Purpose |
| --- | --- |
| `GET /state` | JSON snapshot: running status, round, agents, prices, ledger, offered providers |
| `GET /agent?id=N` | one villager's run: every decision, its tool calls and what it was told |
| `GET /events` | Server-Sent Events stream of what happens in the village |
| `POST /start` | start a run; body e.g. `{"provider":"stub","agents":10}` |
| `POST /stop`, `/pause`, `/resume` | control the current run |
| `GET /tunables`, `POST /tunables` | read the dials, or change them (`{"changes":{...}}` or `{"preset":"famine"}`) |

## Tests and checks

The project has no unit-test suite. It is checked with scripts that run against the real
chain and real providers:

| Command | What it checks | Needs |
| --- | --- | --- |
| `backend/scripts/check-salt.sh` | walks a small village through every instruction that can mint or burn money, and checks the token's supply against the ledger's books after each one | Solana CLI |
| `backend/scripts/check-purses.sh` | agents hold their own token accounts and pay each other in them | Solana CLI |
| `backend/scripts/check-brain.sh` | a provider's key works, the model calls tools, and how long and how much a decision takes (no chain; LLM providers only, not `stub`) | API key |
| headless run (above) | prints every ledger invariant as `ok` or `BROKEN` at the end | validator |
| `npm --prefix web run build` | the frontend compiles | Node |

The two chain checks start validators of their own on other ports, so they don't disturb
a validator you already have running. In Docker:

```bash
docker run --rm aftershock bash backend/scripts/check-salt.sh
docker run --rm aftershock bash backend/scripts/check-purses.sh
docker run --rm -e PROVIDER=openai -e OPENAI_API_KEY -e AGENTS=3 aftershock bash backend/scripts/check-brain.sh
```

Saved runs can be read with `backend/scripts/analyze.mjs`, `macro.mjs`, `trace.mjs` and
`compare.mjs`.

## Project layout

```
backend/        Node server, simulation, agent tools, model providers, scripts
chain/          Anchor program (ledger, auctions, bank, token) and a prebuilt build
web/            React + Vite app: the island and the admin panel
frontend/       standalone island page, served when web/ has not been built
Dockerfile      one container: web app, backend and a validator
```

More detail is in [docs/development.md](docs/development.md).

## Known issues

- Headless runs with `MANAGED_VALIDATOR=1` crash after the run when printing the summary
  (see [Headless](#headless) for the workaround).
- The dial drawer in the panel doesn't refresh when dials are changed through
  `POST /tunables` from outside the page. Reopen the page to see the current values. Changes
  made in the drawer itself display correctly.

## License

This project is licensed under the MIT License.
