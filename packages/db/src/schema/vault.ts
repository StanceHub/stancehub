import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { meetings } from "./meetings";
import { organization } from "./auth";

export const DEFAULT_EMBEDDING_DIMENSIONS = 768;

const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS})`;
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown) {
    if (Array.isArray(value)) return value.map(Number);
    const text = String(value).trim();
    if (!text) return [];
    const inner = text.startsWith("[") ? text.slice(1, -1) : text;
    return inner.split(",").map((part) => Number(part.trim()));
  },
});

export const transcripts = pgTable(
  "transcripts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    rawText: text("raw_text").notNull(),
    format: text("format").notNull().default("plain"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("transcripts_meeting_id_idx").on(t.meetingId),
    index("transcripts_organization_id_idx").on(t.organizationId),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    transcriptId: text("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    startMs: integer("start_ms"),
    endMs: integer("end_ms"),
    embedding: vector("embedding", { dimensions: DEFAULT_EMBEDDING_DIMENSIONS }).notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    contentTsv: customType<{ data: string }>({
      dataType() {
        return "tsvector";
      },
    })("content_tsv").generatedAlwaysAs(sql`to_tsvector('english', content)`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chunks_meeting_chunk_idx").on(t.meetingId, t.chunkIndex),
    index("chunks_organization_id_idx").on(t.organizationId),
    index("chunks_meeting_id_idx").on(t.meetingId),
  ],
);

export const orgSearchStats = pgTable("org_search_stats", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  nDocs: bigint("n_docs", { mode: "number" }).notNull().default(0),
  sumTokenCount: bigint("sum_token_count", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orgTermDf = pgTable(
  "org_term_df",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    lexeme: text("lexeme").notNull(),
    nQi: integer("n_qi").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.lexeme] })],
);
