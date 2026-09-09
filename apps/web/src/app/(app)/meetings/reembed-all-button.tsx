"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReembedAllButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    if (
      !window.confirm(
        "Re-embed every meeting in this organization with the current chunk settings? This queues jobs one-by-one.",
      )
    ) {
      return;
    }
    setMessage("…");
    const res = await fetch("/api/meetings/reembed", { method: "POST" });
    const data = (await res.json()) as {
      error?: string;
      queued?: number;
      skippedRunning?: number;
      skippedMissing?: number;
    };
    if (!res.ok) {
      setMessage(data.error ?? "failed");
      return;
    }
    setMessage(
      `queued ${data.queued ?? 0}` +
        (data.skippedRunning ? `, skipped running ${data.skippedRunning}` : "") +
        (data.skippedMissing ? `, missing ${data.skippedMissing}` : ""),
    );
    router.refresh();
  }

  return (
    <span>
      <button type="button" onClick={onClick}>
        Re-embed all
      </button>
      {message ? <small> {message}</small> : null}
    </span>
  );
}
