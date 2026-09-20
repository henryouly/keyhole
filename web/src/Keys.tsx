import { useEffect, useState } from "react";
import { trpc } from "./lib/trpc";

interface KeyMeta {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  dailyCount: number;
}

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString() : "—";
}

export default function Keys() {
  const [keys, setKeys] = useState<KeyMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(false);
  const [days, setDays] = useState(90);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    trpc.keys.list
      .query()
      .then((rows) => {
        setKeys(rows);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  };

  useEffect(refresh, []);

  const create = () => {
    const scopes = [
      read && "calendar:read",
      write && "calendar:write",
    ].filter((s): s is string => !!s);
    if (!name.trim() || scopes.length === 0) {
      setError("Name and at least one scope are required.");
      return;
    }
    setBusy(true);
    trpc.keys.create
      .mutate({ name: name.trim(), scopes, expiryDays: days })
      .then((out) => {
        setSecret(out.fullKey);
        setName("");
        refresh();
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setBusy(false));
  };

  const revoke = (id: string) => {
    setBusy(true);
    trpc.keys.revoke
      .mutate({ id })
      .then(refresh)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section className="mt-6 rounded border p-4">
      <h2 className="font-semibold">Agent API keys</h2>
      {error && (
        <p className="mt-2 rounded bg-red-100 p-2 text-xs text-red-900">{error}</p>
      )}
      {secret && (
        <div className="mt-2 rounded bg-amber-100 p-3 text-xs">
          <p className="font-semibold">
            Copy now — this full key is never shown again:
          </p>
          <code className="mt-1 block break-all bg-white p-2">{secret}</code>
          <button
            className="mt-2 rounded border bg-white px-3 py-1"
            onClick={() => {
              void navigator.clipboard.writeText(secret);
              setSecret(null);
            }}
          >
            Copy + dismiss
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col">
          Name
          <input
            className="rounded border px-2 py-1"
            placeholder="e.g. openclaw"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={read}
            onChange={(e) => setRead(e.target.checked)}
          />
          calendar:read
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={write}
            onChange={(e) => setWrite(e.target.checked)}
          />
          calendar:write
        </label>
        <label className="flex flex-col">
          Expires in (days)
          <input
            className="w-20 rounded border px-2 py-1"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <button
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={create}
        >
          {busy ? "Working…" : "Create key"}
        </button>
      </div>
      <div className="mt-3 text-sm">
        {keys === null && <p className="text-neutral-600">Loading…</p>}
        {keys !== null && keys.length === 0 && (
          <p className="text-neutral-600">No keys yet.</p>
        )}
        {keys !== null && keys.length > 0 && (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-neutral-500">
                <th className="py-1">Key</th>
                <th>Name</th>
                <th>Scopes</th>
                <th>Expires</th>
                <th>Last used</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t">
                  <td className="py-1 font-mono">{k.prefix}…</td>
                  <td>{k.name}</td>
                  <td>{k.scopes.join(", ")}</td>
                  <td>{fmtDate(k.expiresAt)}</td>
                  <td>{fmtDate(k.lastUsedAt)}</td>
                  <td>{k.revokedAt ? "revoked" : "active"}</td>
                  <td>
                    {!k.revokedAt && (
                      <button
                        className="rounded border px-2 py-0.5"
                        disabled={busy}
                        onClick={() => revoke(k.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
