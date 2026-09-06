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
});

export type EmbedMeetingPayload = z.infer<typeof embedMeetingPayloadSchema>;

export const summarizeMeetingPayloadSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
});

export type SummarizeMeetingPayload = z.infer<typeof summarizeMeetingPayloadSchema>;
