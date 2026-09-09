"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteMeetingButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm("Delete this meeting and its vault chunks? This cannot be undone.")) {
      return;
    }
    setMessage("…");
    const res = await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "failed");
      return;
    }
    setMessage("deleted");
    router.refresh();
  }

  return (
    <span>
      <button type="button" onClick={onDelete}>
        Delete
      </button>
      {message ? <small> {message}</small> : null}
    </span>
  );
}
