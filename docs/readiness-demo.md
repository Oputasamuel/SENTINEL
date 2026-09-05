# SENTINEL readiness demonstration

## NVIDIA/Pashov completion — 2026-09-03

- NVIDIA Nemotron 3.5 Lightning completed Pashov run `14fabead-a4bb-468a-aa4c-15e616c39945`: 12 specialists, judging, and structured extraction.
- The validated result retained the known critical `withdrawBalance` reentrancy at the external call and excluded a zero-value-deposit claim without concrete security impact.
- Review `cab917df-6d8d-498d-9b0c-503695904d9d` was saved locally and synced to the authenticated dashboard.
- NVIDIA's hosted endpoint required streaming. Resume checkpoints recovered three incomplete stage responses without repeating completed stages.

## Verified

- A real earlier Gemini 3.6 Flash basic review identified the known Crytic reentrancy vulnerability. Review ID: 9d1862f6-245f-4a1c-8ea0-17e18673ce85.
- The finding was confirmed through the CLI with a source-based reason. Sibyl stored memory 0629e0d0-a146-4259-b135-3dc088336275.
- A separate CLI process retrieved the memory. A fresh Python process then loaded ReentrancySibling.sol and retrieved that same cross-file invariant with conditions_unchanged=false. Evidence: ../tmp/crytic-reentrancy-test/memory-recall-proof.json.
- The sibling fixture is deliberately derived from Crytic's contract, with renamed contract and withdrawal functions. It is a persistence demonstration, not a blind benchmark.
- The deployed site was made public with user approval. Real device-code login completed, and the CLI synced the confirmed review successfully to https://bugmind-cli.zedef0808.chatgpt.site/dashboard. The user confirmed that the approving account was the second account.
- Local simulated login, one-time device code exchange, authenticated upload, history display, and revocation passed.
- Local account-isolation testing passed with two synthetic account tokens: both uploaded their own records, cross-account overwrite returned 409, and signed-in history excluded the other account's record. Synthetic records and tokens were removed afterward.

## Incomplete

Three new full Pashov attempts failed before any specialist completed: Gemini 3.6 Flash with concurrency 3 returned HTTP 503, Gemini 3.6 Flash sequentially returned a transport/response error, and Gemini 3.7 Flash with concurrency 3 returned HTTP 503. No final Pashov review was accepted or uploaded. No model-selection settings were changed; all used explicit per-run overrides.

The full workflow and model-assisted use of recalled memory are still unverified end to end. Persistence and retrieval are verified independently. Resume a full live review when provider service recovers or another user-configured provider is available.

## Fixes during validation

- The dashboard client now sends the SENTINEL User-Agent. A hosted login that initially returned 403 succeeded on retry with that header; access-propagation timing may also have contributed.
- Provider HTTP 5xx errors now report temporary service failure rather than suggesting an invalid API key.

Do not claim a successful full Pashov audit, improved detection accuracy from memory, or second-user verification until those specific checks complete.

## Recovery repair

- Transient transport failures and HTTP 408/500/502/503/504 now receive exactly one retry after five seconds. Quota, authentication, malformed-response, and refusal failures do not automatically retry. Retry requests may incur provider usage.
- Successful stages are written atomically to local checkpoints. `--resume RUN_ID` reuses them only for matching source, memory, provider/model, upstream instructions, and adapter code. Inputs that changed require a fresh run.
- Scheduling submits only a bounded batch; failure preserves successful peers and prevents subsequent batches from launching.
- 35 tests pass, including retry limits, no retry for permanent errors, reuse after partial completion, changed-input rejection, and retention of successful parallel results.
- Live run 3e464f6e-0ccd-499b-8536-d6baedd94129 failed with Gemini HTTP 503 both at concurrency three and when resumed sequentially. No specialist completed. Minimal Gemini health requests succeeded, but the actual review requests still failed. The cause of this difference is not established.
- The full Pashov demonstration remains incomplete. Recovery behavior is verified with automated tests; a successful live review is not claimed.

