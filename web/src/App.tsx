import { useEffect, useState } from "react";
import Keys from "./Keys";
import { signIn, signOut, useSession } from "./lib/auth-client";
import { trpc } from "./lib/trpc";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  unable_to_create_user:
    "This Google account is not authorized for Keyhole. Only the allowlisted admin account may sign in.",
  forbidden: "You must be signed in as the admin to do that.",
  oauth_disabled:
    "Google connect is disabled on this deployment (preview isolation).",
  no_refresh_token:
    "Google did not return a refresh token. Remove Keyhole access at myaccount.google.com/permissions, then reconnect.",
  exchange_failed: "Token exchange with Google failed. Please retry.",
  bad_state: "OAuth state check failed (stale or tampered request). Retry.",
  missing_params: "OAuth callback was missing parameters. Retry.",
  google_access_denied: "You denied the Google consent screen. Reconnect to grant access.",
};

function useQueryParams(): { error: string | null; connected: string | null } {
  const [params] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const out = { error: q.get("error"), connected: q.get("connected") };
    if (out.error || out.connected) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    return out;
  });
  return params;
}

type ConnectionStatus =
  | { connected: false }
  | {
      connected: true;
      provider: string;
      accountEmail: string | null;
      scopes: string | null;
      expiresAt: Date | null;
    };

function ConnectCard() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setError(null);
    trpc.connection.status
      .query()
      .then(setStatus)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  };

  useEffect(refresh, []);

  const disconnect = () => {
    setBusy(true);
    trpc.connection.disconnect
      .mutate()
      .then(refresh)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section className="mt-6 rounded border p-4">
      <h2 className="font-semibold">Google Calendar connection</h2>
      {status === null && !error && (
        <p className="mt-2 text-sm text-neutral-600">Loading…</p>
      )}
      {error && (
        <p className="mt-2 rounded bg-red-100 p-2 text-xs text-red-900">
          {error}
        </p>
      )}
      {status && !status.connected && (
        <div className="mt-2">
          <p className="text-sm text-neutral-600">Not connected.</p>
          <a
            className="mt-2 inline-block rounded bg-black px-4 py-2 text-sm text-white"
            href="/api/oauth/google/start"
          >
            Connect Google Calendar
          </a>
        </div>
      )}
      {status?.connected && (
        <div className="mt-2 text-sm">
          <p>
            Connected{status.accountEmail ? ` as ${status.accountEmail}` : ""}.
          </p>
          <button
            className="mt-2 rounded border px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={disconnect}
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const { data: session, isPending } = useSession();
  const { error: authError, connected } = useQueryParams();
  const [viewer, setViewer] = useState<{ email: string; name: string } | null>(
    null,
  );
  const [viewerError, setViewerError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setViewer(null);
    setViewerError(null);
    trpc.viewer.me
      .query()
      .then(setViewer)
      .catch((e: unknown) =>
        setViewerError(e instanceof Error ? e.message : String(e)),
      );
  }, [session]);

  if (isPending) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p className="text-sm text-neutral-600">Checking session…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">Keyhole</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Personal OAuth → scoped-key bridge. Sign in with your Google account.
        </p>
        {authError && (
          <p className="mt-4 rounded bg-red-100 p-4 text-xs text-red-900">
            Sign-in failed ({authError}):{" "}
            {AUTH_ERROR_MESSAGES[authError] ?? "Unknown error."}
          </p>
        )}
        <button
          className="mt-4 rounded bg-black px-4 py-2 text-sm text-white"
          onClick={() => signIn.social({ provider: "google" })}
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Keyhole</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Signed in as {session.user.email}
      </p>
      {viewer && (
        <pre className="mt-4 rounded bg-neutral-100 p-4 text-xs">
          viewer.me: {JSON.stringify(viewer)}
        </pre>
      )}
      {viewerError && (
        <pre className="mt-4 rounded bg-red-100 p-4 text-xs">
          viewer.me error (non-admin blocked): {viewerError}
        </pre>
      )}
      <div className="mt-4 flex gap-2">
        <button
          className="rounded border px-4 py-2 text-sm"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </div>
      {connected && (
        <p className="mt-4 rounded bg-green-100 p-4 text-xs text-green-900">
          Connected to {connected}. Tokens are encrypted and never shown.
        </p>
      )}
      {authError && (
        <p className="mt-4 rounded bg-red-100 p-4 text-xs text-red-900">
          {AUTH_ERROR_MESSAGES[authError] ?? `Unknown error (${authError}).`}
        </p>
      )}
      <ConnectCard />
      <Keys />
      <p className="mt-6 text-xs text-neutral-500">
        Calendar proxy + agent skill land in Phase 4–5.
      </p>
    </main>
  );
}
