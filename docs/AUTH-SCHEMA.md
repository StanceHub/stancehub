# Better Auth ↔ Drizzle schema (#47)

StanceHub stores Better Auth tables in `@stancehub/db` (`packages/db/src/schema/auth.ts`) and wires them in `apps/web/src/server/auth.ts` via `authDrizzleSchema`.

## CI gate

`apps/web/src/server/auth-schema-drift.test.ts` awaits Better Auth’s drizzle `checkSchema()` against those tables. It runs in `pnpm test` / the CI `typecheck` job (no Postgres required).

A missing required column (e.g. historical `invitation.createdAt`) fails the suite.

## When bumping `better-auth`

1. Bump the dependency in `apps/web`.
2. Run `pnpm --filter @stancehub/web test` — if `auth-schema-drift` fails, read the mismatch message.
3. Update `packages/db/src/schema/auth.ts` (and `authDrizzleSchema` if new tables/plugins).
4. `pnpm db:generate` (or hand-write SQL) + `pnpm db:migrate`.
5. Re-run the drift test until green.
6. Do **not** blindly overwrite the whole monorepo schema with `auth generate` — it can clobber vault/intelligence tables.

## Notes

- Enabling more organization features (teams, etc.) adds tables/columns; extend `authDrizzleSchema` and migrations together.
- This check proves **Drizzle defs match Better Auth expectations**. Applying SQL migrations to each environment remains a separate ops step.
