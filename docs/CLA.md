# Contributor License Agreement (CLA) — plain language

## What is a CLA?

A **Contributor License Agreement** is a short legal agreement that says:

> When you contribute code to StanceHub, you keep ownership of your contribution,  
> but you give StanceHub (the project/company) permission to use, modify, and distribute that code — including in a commercial Enterprise / Cloud product.

Without a CLA, if many people contribute under an open-source license only, it can become hard for the company to sell Enterprise features cleanly later.

## Do we need this now?

**Yes, for good hygiene** — even while the repo is private — so when we later publish Community Edition (planned AGPLv3) and sell Cloud/Enterprise, contributions already have clear rights.

## What this is NOT

- It is **not** “you lose your copyright”
- It is **not** a public open-source launch
- It is **not** related to having a custom domain email

## What “public CE launch” means (simple)

| Term | Meaning |
|---|---|
| **Private MVP (now)** | Code only visible to StanceHub org members |
| **Public CE launch (later)** | We publish Community Edition on GitHub for anyone to self-host (planned AGPLv3) |
| **Cloud / Enterprise** | Paid hosted service and paid compliance/SSO features |

We stay private until IP ownership and company paperwork are clearer. That is intentional.

## Agreement (team members)

By contributing to this repository (opening a PR or merging code), you agree that:

1. You wrote the contribution yourself, or have rights to submit it.
2. You grant StanceHub and its maintainers a perpetual, worldwide, royalty-free license to use, review, modify, sublicense, and distribute your contribution as part of StanceHub products (including Community Edition, Cloud, and Enterprise).
3. You understand the project may later relicense Community Edition under AGPLv3 and keep Enterprise modules proprietary (open-core), consistent with `stancehub-docs`.

**How to accept (exact wording — copy/paste):**

On your first pull request, reply with **exactly** this line (no extra punctuation):

```text
I have read the CLA Document and I hereby sign the CLA
```

To re-run the CLA check after signing (or if the status is stuck), comment:

```text
recheck
```

That signature is stored under `signatures/version1/cla.json`. You only sign once.
You can also check the box in the PR template; the **bot comment** with the sign line above is what records the CLA.

Bots on the allowlist (`dependabot[bot]`, `github-actions[bot]`, etc.) are exempt.
No custom domain email is required.

## Company / IP note

Founders should still complete separate **IP assignment to the company** when the legal entity exists. The CLA covers outside/team contributions; founder IP assignment is a company document, not a GitHub setting.
