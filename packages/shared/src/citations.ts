import { z } from "zod";

export const citationSchema = z.object({
  meetingId: z.string().min(1),
  chunkId: z.string().min(1),
  quote: z.string().min(1),
  startTs: z.number().optional(),
  endTs: z.number().optional(),
});

export type Citation = z.infer<typeof citationSchema>;
