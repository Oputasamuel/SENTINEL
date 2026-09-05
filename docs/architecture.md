# Architecture

Sibyl memory is a mandatory runtime dependency. Every review must initialize and read the repository-scoped Sibyl store before any model request. There is no baseline or memory-disabled review mode; if Sibyl is unavailable, SENTINEL stops the review.

The CLI reads explicitly selected local Solidity files and bounded local imports, loads repository-isolated Sibyl memory, and calls the user's configured provider directly. Findings are validated against source paths, line numbers, exact evidence excerpts, and known memory IDs. Human confirm/reject/fixed decisions write memory. Confirmed invariants from other files provide cross-file context; hashes mark changed assumptions.

Provider keys are stored in the OS keyring. The CLI discovers models from each provider's live API. Source and full review artifacts stay on the client except for the direct LLM request. The old Python HTTP worker is not required.

The Sites dashboard provides tutorials, ChatGPT sign-in, CLI device approval, and account-scoped review history backed by D1. Device codes expire after ten minutes and are exchanged once for a 30-day bearer token. Only token hashes are stored server-side. Review ingestion validates and whitelists summary fields. A user can revoke all CLI sessions.

Sibyl is live. The default CLI Pashov adapter uses 12 bundled specialist instruction sets, upstream dedup/judging/report rules, and structured source validation. The upstream revision and completed stages are recorded per run. This is a bounded API adaptation; native tools and fuzzing are not implemented. Virtuals ACP and Base proof integrations are not yet connected.

