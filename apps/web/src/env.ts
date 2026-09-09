import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  // Shared migration fallbacks (prefer EMBEDDING_* / CHAT_* below)
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // Embeddings (vault retrieval)
  EMBEDDING_BASE_URL: z.string().url().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().optional(),
  // Chat (summarize / ask)
  CHAT_BASE_URL: z.string().url().optional(),
  CHAT_API_KEY: z.string().optional(),
  CHAT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  OLLAMA_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Raw process env for shared resolvers (includes keys Zod may not surface). */
export function getProcessEnvRecord(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}
