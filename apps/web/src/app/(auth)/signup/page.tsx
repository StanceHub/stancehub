"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const { error: signErr } = await authClient.signUp.email({
      email,
      password,
      name,
    });
    if (signErr) {
      setPending(false);
      setError(signErr.message ?? "Sign-up failed");
      return;
    }

    const slug = orgName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);

    const { error: orgErr } = await authClient.organization.create({
      name: orgName.trim() || `${name}'s org`,
      slug: slug || `org-${Date.now()}`,
    });
    setPending(false);
    if (orgErr) {
      setError(orgErr.message ?? "Org create failed (you can create one later)");
      router.push("/meetings");
      return;
    }

    router.push("/meetings");
    router.refresh();
  }

  return (
    <main>
      <h1>Sign up</h1>
      <p>
        Have an account? <a href="/login">Log in</a>
      </p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          Organization name
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            style={{ display: "block", width: "100%" }}
          />
        </label>
        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? "…" : "Create account"}
        </button>
      </form>
    </main>
  );
}
