"use client";

import { useState } from "react";

export function PingButton() {
  const [msg, setMsg] = useState<string | null>(null);

  async function ping() {
    setMsg("…");
    const res = await fetch("/api/queue/ping", { method: "POST" });
    const data = (await res.json()) as { ok?: boolean; jobId?: string; error?: string };
    if (!res.ok) {
      setMsg(data.error ?? "failed");
      return;
    }
    setMsg(`enqueued job ${data.jobId}`);
  }

  return (
    <div>
      <button type="button" onClick={ping}>
        Enqueue queue ping
      </button>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
