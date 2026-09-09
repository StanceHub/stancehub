"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TaskStatusButton({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const next = status === "done" ? "open" : "done";

  async function onClick() {
    setMessage("…");
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "failed");
      return;
    }
    setMessage(null);
    router.refresh();
  }

  return (
    <span>
      <button type="button" onClick={onClick}>
        Mark {next}
      </button>
      {message ? <small> {message}</small> : null}
    </span>
  );
}
