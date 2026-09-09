ALTER TABLE "chunks" ADD COLUMN "token_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "chunks"
SET "token_count" = (
  SELECT coalesce(sum(cardinality(u.positions)), 0)::integer
  FROM unnest("content_tsv") AS u(lexeme, positions)
);
--> statement-breakpoint
CREATE TABLE "org_search_stats" (
  "organization_id" text PRIMARY KEY NOT NULL,
  "n_docs" bigint DEFAULT 0 NOT NULL,
  "sum_token_count" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_search_stats"
  ADD CONSTRAINT "org_search_stats_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "org_term_df" (
  "organization_id" text NOT NULL,
  "lexeme" text NOT NULL,
  "n_qi" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "org_term_df_pkey" PRIMARY KEY ("organization_id", "lexeme")
);
--> statement-breakpoint
ALTER TABLE "org_term_df"
  ADD CONSTRAINT "org_term_df_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "org_search_stats" ("organization_id", "n_docs", "sum_token_count", "updated_at")
SELECT
  "organization_id",
  count(*)::bigint,
  coalesce(sum("token_count"), 0)::bigint,
  now()
FROM "chunks"
GROUP BY "organization_id"
ON CONFLICT ("organization_id") DO UPDATE SET
  "n_docs" = EXCLUDED."n_docs",
  "sum_token_count" = EXCLUDED."sum_token_count",
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "org_term_df" ("organization_id", "lexeme", "n_qi")
SELECT
  c."organization_id",
  u.lexeme,
  count(*)::integer
FROM "chunks" c
CROSS JOIN LATERAL unnest(c."content_tsv") AS u(lexeme, positions)
GROUP BY c."organization_id", u.lexeme
ON CONFLICT ("organization_id", "lexeme") DO UPDATE SET
  "n_qi" = EXCLUDED."n_qi";
