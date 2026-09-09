"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setMessage("…");
    const res = await fetch(`/api/meetings/${meetingId}/retry`, { method: "POST" });
    const data = (await res.json()) as { error?: string; alreadyRunning?: boolean };
    if (!res.ok) {
      setMessage(data.error ?? "failed");
      return;
    }
    setMessage(data.alreadyRunning ? "already running" : "queued");
    router.refresh();
  }

  return (
    <span>
      <button type="button" onClick={retry}>
        Retry embed
      </button>
      {message ? <small> {message}</small> : null}
    </span>
  );
}
