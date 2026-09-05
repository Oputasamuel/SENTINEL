# SENTINEL

SENTINEL is a dashboard for finding smart-contract vulnerabilities and following every finding until it is fixed.

There is one way to use the product: the dashboard.

## The hunter's workflow

1. The hunter signs up with an email address.
2. They create a workspace for an audit or bounty target.
3. They paste the public GitHub repository link.
4. SENTINEL reads the repository and lists its Solidity contracts.
5. The hunter selects the contracts they want to review.
6. Pashov reviews the selected contracts and returns possible vulnerabilities with code evidence.
7. The hunter confirms or dismisses each result and can add their own manual findings.
8. Sibyl remembers every accepted and manual finding against the repository, contract, code location, and commit where it was found.
9. Every day, SENTINEL checks the original repository for new commits.
10. When relevant code changes, SENTINEL uses Sibyl's remembered finding to test whether the same attack path still exists.
11. The finding becomes **Open**, **Possibly fixed**, **Fixed**, **Returned**, or **Needs review**.
12. The hunter receives an email only when something meaningful changes or needs a decision.

## Workspace pages

- **Overview:** contracts, open findings, recent changes, and the next scheduled check.
- **Contracts:** discovered Solidity files and the contracts selected for review.
- **Findings:** automated and manual findings, evidence, severity, owner notes, and full history.
- **Changes:** commits that touched watched contracts and what SENTINEL concluded.
- **Activity:** reviews, decisions, emails, Base proofs, and Virtuals jobs.
- **Settings:** repository connection, daily schedule, email preferences, and integrations.

## What Sibyl does

Sibyl is required. It remembers the security meaning of a finding, not merely its title. Each memory includes the vulnerable behavior, the affected contract and function, the attack conditions, evidence from the discovery commit, the expected fix, the hunter's decisions, and later checks.

SENTINEL cannot run a review or a daily check when Sibyl is unavailable. A changed line alone never means a bug is fixed.

## Finding states

- **Open:** the vulnerable behavior is still present.
- **Possibly fixed:** relevant code changed and the attack path appears closed, but the hunter has not approved the result.
- **Fixed:** the hunter accepted the fix after SENTINEL's recheck.
- **Returned:** a previously fixed vulnerability is possible again.
- **Needs review:** the evidence is incomplete or two reviewers disagree.
- **Dismissed:** the hunter decided the result is not a vulnerability and recorded why.

Every change is appended to the history. Earlier evidence and decisions are never overwritten.

## Base integration

Base provides tamper-resistant proof without publishing private vulnerability details.

When a hunter confirms a finding, accepts a fix, or detects a return, SENTINEL can create a proof containing hashes of the workspace, repository, commit, finding, state, and timestamp. The dashboard links to the Base transaction. Anyone receiving a later report can verify that the finding existed at that time and that its history was not rewritten.

For the hackathon demo, SENTINEL pays the small transaction fee from a restricted service wallet on Base Sepolia. The user's email account can later be linked to a wallet, but a wallet is not required to use the dashboard.

## Virtuals integration

SENTINEL is registered as a Virtuals ACP provider with a **Contract Recheck** job. Another agent can submit a repository, contract, commit, and finding fingerprint and receive a signed recheck result.

Inside SENTINEL, Virtuals is also used when a daily check is uncertain. SENTINEL opens a narrowly scoped second-opinion job containing only the public repository reference and the minimum evidence needed. The job result is stored as another opinion; it never silently changes the hunter's finding.

This gives Virtuals a visible, useful role: SENTINEL can sell its recheck service to other agents and can hire a specialist when its own evidence is uncertain.

## Email rules

SENTINEL sends email when:

- a review finishes;
- a finding appears fixed and needs approval;
- a fixed vulnerability returns;
- a daily check fails repeatedly;
- a Virtuals second opinion is ready.

It does not send a daily "nothing changed" message.

## Product promise

**Find the bug. Remember it. Know when it is fixed.**
