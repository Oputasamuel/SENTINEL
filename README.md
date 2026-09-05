# SENTINEL

A CLI-first Solidity reviewer with repository-specific Sibyl memory and a signed-in review dashboard. Each user supplies their own provider key; requests go directly from their machine to Gemini, OpenAI, OpenRouter, Anthropic (Claude), AgentRouter, or NVIDIA NIM. SENTINEL does not fund model usage.

## Install from this source checkout

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -e .
sentinel --help
sentinel login --dashboard https://YOUR-DASHBOARD
sentinel select provider
```

Run `sentinel select provider` for the guided setup: choose a numbered provider (Gemini, OpenAI, OpenRouter, or Anthropic), enter your API key privately, then choose a numbered model from the live catalog. Exact provider/model IDs also work. Invalid selections can be retried; enter `q` at a menu or press Ctrl+C to cancel before saving. The existing `sentinel provider add PROVIDER` command also supports the model menu. Keys and dashboard tokens use the operating system credential store; SENTINEL refuses a plaintext keyring. Catalog availability does not guarantee review compatibility or free usage. There is no published package release yet.

## Review a project

Run these commands from your Solidity repository:

```sh
sentinel init
sentinel review contracts/Vault.sol
sentinel confirm REVIEW_ID FINDING_ID --reason "Withdrawals must require owner authorization."
sentinel review contracts/Treasury.sol
sentinel memory
sentinel sync REVIEW_ID
```

Add `.bugmind/` to that repository's `.gitignore`. Reviews include selected files and bounded local imports (20 files / 120 KB total), and report missing dependencies. Confirmed cross-file invariants can inform the next review. Memory persists locally in Sibyl; changed source assumptions require revalidation. Sibyl is mandatory: SENTINEL refuses to review when its memory store cannot initialize or be read. Use `--local-only` to skip dashboard synchronization. Only human feedback writes memory. Use `reject` or `fixed` with `--reason` to record decisions.

The dashboard stores review summaries and finding locations under the signed-in account. Source, evidence excerpts, raw memory, and provider keys stay out of dashboard uploads. Source is sent to the user's selected LLM provider during review. Full review artifacts and memory remain under the local project's `.bugmind/` directory. CLI access tokens expire after 30 days and can be revoked on the dashboard.

## Dashboard development

```sh
cd dashboard
npm install
npm run build
npx wrangler d1 execute DB --local --file=drizzle/0000_equal_nighthawk.sql --persist-to=.wrangler/state --config dist/server/wrangler.json
npm run dev
```

The dashboard uses Sites authentication and D1. Its local sign-in flow is simulated. A deployed CLI needs a publicly reachable dashboard origin; review history still requires authentication and is scoped by account. An owner-only Sites preview cannot support unauthenticated CLI device polling.

## Validation

```sh
python -m unittest discover -s tests -v
python tests/smoke_dashboard.py
```

The dashboard smoke test requires the running local dashboard and creates a local test review. Never run it against production.

Sibyl and a pinned Pashov Solidity auditor API adaptation are integrated in the CLI. Virtuals ACP and Base proofs remain planned. This is not a formal audit or a review by the Pashov team. The legacy loopback worker remains for earlier fixtures/tests and is not used by the CLI dashboard.

MIT license.

## Pashov review engine (default)

`sentinel review contracts/Vault.sol --local-only` now uses actual bundled instructions from [pashov/skills](https://github.com/pashov/skills), pinned to revision `c577eb7799c349de0acb187ba00ca98e14e436fd` (solidity-auditor VERSION 3). The MIT license and per-file integrity hashes ship with the package.

The workflow makes 14 calls to your selected provider: 12 independent specialist passes, one consolidation/judging report, and one structured extraction for SENTINEL's source validation. Default concurrency is one to reduce rate-limit bursts; `--concurrency 3` allows three specialists at once. Costs and quotas apply to your provider account. There is no provider fallback or automatic update of pinned instructions. Transport errors and HTTP 408/500/502/503/504 get one retry after five seconds; quota, authentication, model-format errors, and refusals are not retried. Each retry can incur provider usage.

Use `--engine basic` explicitly for the previous single-call reviewer. Both engines require Sibyl memory.

Local `.bugmind/pashov-runs/` contains the specialist responses, report (including leads), and run metadata. Only completed, source-validated findings enter the review artifact. Failure retains completed stage checkpoints and accepts no findings. Resume with the printed `--resume RUN_ID` and the same files/model. Completed stages are reused; only unfinished stages call the provider again. Resuming rejects changed source, memory, model, or instructions. Without `--resume`, a new run starts and can incur calls again. Raw reports and source are never uploaded to the dashboard. Report preservation is an intentional adaptation for this product's review-history requirement.

This is a bounded API adaptation, not the native Pashov agent runtime: it uses the selected model for every pass, has no autonomous file search or test execution, supplies local imports as context, and keeps incomplete dependency paths as leads. It retains the upstream files unchanged and applies explicit runtime corrections for narrowing casts and blanket safe-pattern assumptions. Concise evidence summaries replace requests for private reasoning. Workflow marker counts are diagnostics, not a correctness guarantee. The deployed dashboard has not been changed by this CLI update.

## Anthropic / Claude

```sh
sentinel provider add anthropic
sentinel models --provider anthropic
sentinel models --provider anthropic --select MODEL_ID
sentinel review contracts/Vault.sol --local-only
```

Enter your Anthropic API key at the hidden prompt and choose an exact Claude model ID from the live catalog. All catalog pages are fetched; no model names are hardcoded. Selection makes Anthropic the active provider. Both the default Pashov workflow and `--engine basic` use the selected Claude model. Keys use the same local OS credential store as other providers.

The adapter uses Anthropic's native Messages API and a named output tool for structured review data; it executes no external tool actions. Incomplete or refused responses are rejected. Model access, token limits, pricing, and quotas depend on the user's Anthropic account. No Anthropic key was available for a live integration test; automated tests use simulated API responses.

API references: [model catalog](https://platform.claude.com/docs/en/api/models/list), [Messages and tool schemas](https://platform.claude.com/docs/en/api/messages/create).

## Recovering an interrupted Pashov review

```sh
sentinel review contracts/Vault.sol --local-only --model MODEL_ID --resume RUN_ID
```

Use the run ID printed by the failed review, not its final review ID. Keep the same selected files, model, and memory mode. You may reduce `--concurrency` when resuming. Do not confirm or reject findings in the project between attempts: a memory change requires a new review. Successful stages are saved immediately, including successful calls from a batch where another call failed. A complete fresh run has 14 successful stages and up to 28 requests with transient retries; resumed runs require fewer calls. API outages can still prevent completion, and refusals remain failures.

## AgentRouter

Run `sentinel select provider`, choose **AgentRouter**, enter the AgentRouter token at the hidden prompt, then select an exact model from its live `/v1/models` response. The token is stored under its own provider entry in the OS credential store. AgentRouter uses `https://agentrouter.org/v1`; Claude IDs beginning with `claude-` use Messages, while other models use Chat Completions. Both routes need live verification with the user's token; a catalog entry is not a guarantee of review compatibility. Requests and credit usage go through AgentRouter, not a direct Anthropic/OpenAI account. API access restrictions are not bypassed.

Official setup references: https://github.com/agentrouter-org/docs/blob/main/en/roocode.md and https://github.com/agentrouter-org/docs/blob/main/en/start.md.

AgentRouter compatibility remains unverified: live setup returned HTTP 401. SENTINEL now distinguishes explicit unauthorized-client errors from invalid-token errors where the server provides that detail. AgentRouter credits do not establish access for custom clients; an unauthorized-client rejection requires provider approval. SENTINEL does not impersonate a supported application to bypass that restriction.

