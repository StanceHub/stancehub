# Branch protection status

## Intended policy for `main`

- No direct force-push / delete of `main`
- Changes via pull request
- At least **1 approving review**
- **CODEOWNERS** review required (`@StanceHub/owners`)

## Why it is not API-enforced yet

On GitHub **Free** for organizations, **branch protection / rulesets on private repositories** require an upgrade (GitHub Team or making the repo public).

StanceHub intentionally stays **private** for now (IP / company setup pending), so protection rules are documented here as **team policy** until:

1. the org upgrades to **GitHub Team**, or
2. a public CE repo exists later (protection works on public repos on Free)

## What to do in the meantime

Owners should:

1. Always use PRs into `main` (do not push straight to `main` except emergencies)
2. Require the other owner to review when two people are active
3. Keep `CODEOWNERS` and PR template CLA checkbox in use

When GitHub Team is enabled, turn on the repository ruleset named `main-protection` (or classic branch protection) with the settings above.
