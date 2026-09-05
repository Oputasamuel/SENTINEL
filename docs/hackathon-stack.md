# Selected hackathon stack: shared AgentRouter service

This records the user's selected replacement architecture. It is not a claim that the migration or integrations are implemented.

## User experience

Users sign in, connect the CLI, initialize their Solidity project, and submit selected files for review. Remove provider selection and API-key entry from this flow once the replacement backend is operational. AgentRouter is the sole LLM gateway; the operator supplies its API token as a server secret. Never distribute that token inside the CLI, browser bundle, public config, logs, or reports.

## Components

- AgentRouter: shared inference through an endpoint authorized for SENTINEL. All users consume the operator's credit balance. Authentication, per-account request limits, bounded concurrency, and an operator-controlled total usage limit are required before public review execution is enabled.
- Pashov skill: the pinned upstream specialist and judging instructions drive the server-side review jobs. Retain provenance, refusal handling, validation, and resumable stages.
- Sibyl: repository and account-scoped persistent memory. Preserve confirmed feedback and revalidate recalled assumptions against new source. The CLI can retain its local memory initially; any shared memory service must isolate users and projects.
- Base: planned verifiable review receipts. Store a digest and minimal provenance on-chain, not source code, private findings, API tokens, or raw memory. Network selection, deployment, and transaction execution remain unimplemented.
- Virtuals: planned requester/provider coordination through ACP. If both agents are operated by this project, disclose that clearly. Registration and a real completed job remain unimplemented.

## Data-flow change

The current CLI sends code directly to a user-selected provider. The replacement sends selected source and required memory context to SENTINEL's authenticated backend, which calls AgentRouter. Update the privacy notice accordingly: source will traverse the SENTINEL service and AgentRouter. Existing claims that the dashboard/backend never receives source cannot be retained for this review endpoint. Review history remains account-private.

## Current blocker

AgentRouter returned an explicit unauthorized-client rejection during live setup. A funded token does not establish permission for this client. Obtain AgentRouter approval for SENTINEL or a documented authorized endpoint before enabling inference. Do not impersonate another application, spoof an approved client, or bypass the restriction.

The running CLI still uses the earlier multi-provider implementation. Do not present this document as a completed migration or remove the working execution path before the replacement is usable. No shared API key has been collected or deployed. Base and Virtuals are not yet integrated.

