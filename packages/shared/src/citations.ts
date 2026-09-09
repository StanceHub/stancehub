import { z } from "zod";

export const citationSchema = z.object({
  meetingId: z.string().min(1),
  chunkId: z.string().min(1),
  meetingTitle: z.string().optional(),
  quote: z.string().min(1),
  startMs: z.number().int().nullable().optional(),
  endMs: z.number().int().nullable().optional(),
});

export type Citation = z.infer<typeof citationSchema>;

export const meetingActionSchema = z.object({
  title: z.string().min(1),
  assigneeHint: z.string().nullish().transform((value) => value ?? undefined),
});

export type MeetingAction = z.infer<typeof meetingActionSchema>;

export const meetingSummaryPayloadSchema = z.object({
  summary: z.string().min(1),
  actions: z.array(meetingActionSchema).default([]),
});

export type MeetingSummaryPayload = z.infer<typeof meetingSummaryPayloadSchema>;

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model response did not contain JSON");
  }
}

export function parseMeetingSummaryPayload(text: string): MeetingSummaryPayload {
  const raw = extractJsonObject(text);
  return meetingSummaryPayloadSchema.parse(raw);
}
