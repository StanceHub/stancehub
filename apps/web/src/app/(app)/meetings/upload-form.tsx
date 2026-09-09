"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function UploadForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setMessage("Saving…");
    const form = new FormData(formEl);
    const res = await fetch("/api/meetings", { method: "POST", body: form });
    const data = (await res.json()) as { error?: string; meetingId?: string };
    if (!res.ok) {
      setMessage(data.error ?? "failed");
      return;
    }
    setMessage(`Saved ${data.meetingId}. Embedding queued.`);
    formEl.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 640 }}>
      <label>
        Title
        <br />
        <input name="title" required placeholder="Weekly planning" />
      </label>
      <label>
        Paste transcript
        <br />
        <textarea name="text" rows={6} style={{ width: "100%" }} />
      </label>
      <label>
        Or upload .txt / .vtt / .srt
        <br />
        <input name="file" type="file" accept=".txt,.vtt,.srt,text/plain" />
      </label>
      <button type="submit">Save transcript</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
