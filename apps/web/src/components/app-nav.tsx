import Link from "next/link";
import { SignOutButton } from "@/app/(app)/meetings/sign-out-button";

type AppNavProps = {
  email: string;
  organizationLabel: string | null;
  showSignOut?: boolean;
};

export function AppNav({ email, organizationLabel, showSignOut = true }: AppNavProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <nav aria-label="Primary">
        <Link href="/meetings">Meetings</Link>
        {" · "}
        <Link href="/search">Search</Link>
        {" · "}
        <Link href="/ask">Ask</Link>
        {" · "}
        <Link href="/tasks">Tasks</Link>
        {showSignOut ? (
          <>
            {" · "}
            <SignOutButton />
          </>
        ) : null}
      </nav>
      <p style={{ marginTop: 8, marginBottom: 0, color: "#444" }}>
        Signed in as <strong>{email}</strong>
        {organizationLabel ? (
          <>
            {" "}
            · org <strong>{organizationLabel}</strong>
          </>
        ) : (
          <> · no active organization</>
        )}
      </p>
    </div>
  );
}
