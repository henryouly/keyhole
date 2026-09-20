import { useEffect, useState } from "react";
import { trpc } from "./lib/trpc";

interface AuditRow {
  apiKeyPrefix: string | null;
  method: string;
  path: string;
  status: number;
  ms: number | null;
  createdAt: Date;
}

export default function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    trpc.audit.recent
      .query({ limit: 25 })
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  };

  useEffect(refresh, []);

  return (
    <section className="mt-6 rounded border p-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Recent agent calls</h2>
        <button className="rounded border px-2 py-0.5 text-xs" onClick={refresh}>
          Refresh
        </button>
      </div>
      {error && (
        <p className="mt-2 rounded bg-red-100 p-2 text-xs text-red-900">{error}</p>
      )}
      {rows === null && !error && (
        <p className="mt-2 text-sm text-neutral-600">Loading…</p>
      )}
      {rows !== null && rows.length === 0 && (
        <p className="mt-2 text-sm text-neutral-600">No calls yet.</p>
      )}
      {rows !== null && rows.length > 0 && (
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-neutral-500">
              <th className="py-1">Time</th>
              <th>Key</th>
              <th>Method</th>
              <th>Path</th>
              <th>Status</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t font-mono">
                <td className="py-1">
                  {new Date(r.createdAt).toLocaleTimeString()}
                </td>
                <td>{r.apiKeyPrefix ?? "—"}</td>
                <td>{r.method}</td>
                <td className="break-all">{r.path}</td>
                <td>{r.status}</td>
                <td>{r.ms ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
