import { z } from "zod";

/** BullMQ job / queue names */
export const JOB_NAMES = {
  ping: "ping",
  embedMeeting: "embed_meeting",
  summarizeMeeting: "summarize_meeting",
} as const;

export const QUEUE_NAME = "stancehub" as const;

export const pingJobPayloadSchema = z.object({
  requestedAt: z.string().datetime(),
  note: z.string().optional(),
});

export type PingJobPayload = z.infer<typeof pingJobPayloadSchema>;

export const embedMeetingPayloadSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  generation: z.number().int().positive().default(1),
});

export type EmbedMeetingPayload = z.infer<typeof embedMeetingPayloadSchema>;

export function embedJobId(meetingId: string, generation: number) {
  return `embed:${meetingId}:${generation}`;
}

export const summarizeMeetingPayloadSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  generation: z.number().int().positive(),
});

export type SummarizeMeetingPayload = z.infer<typeof summarizeMeetingPayloadSchema>;

export function summarizeJobId(meetingId: string, generation: number) {
  return `summarize:${meetingId}:${generation}`;
}

const LIVE_EMBED_JOB_STATES = new Set([
  "active",
  "waiting",
  "delayed",
  "waiting-children",
  "prioritized",
  "paused",
]);

export function isLiveEmbedJobState(state: string) {
  return LIVE_EMBED_JOB_STATES.has(state);
}

/** Alias — summarize uses the same BullMQ live states. */
export const isLiveJobState = isLiveEmbedJobState;
