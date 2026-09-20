import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "./lib/auth-client";
import { trpc } from "./lib/trpc";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  unable_to_create_user:
    "This Google account is not authorized for Keyhole. Only the allowlisted admin account may sign in.",
};

function useAuthError(): string | null {
  const [error] = useState(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) window.history.replaceState(null, "", window.location.pathname);
    return code;
  });
  return error;
}

export default function App() {
  const { data: session, isPending } = useSession();
  const authError = useAuthError();
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
      <p className="mt-6 text-xs text-neutral-500">
        Dashboard (connections, keys, audit) lands in Phase 3–5.
      </p>
    </main>
  );
}
