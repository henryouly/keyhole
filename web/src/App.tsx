import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState<string>("checking…");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((j) => setHealth(JSON.stringify(j)))
      .catch(() => setHealth("api unreachable (dev server not running?)"));
  }, []);

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Keyhole</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Personal OAuth → scoped-key bridge. Phase 0 scaffold.
      </p>
      <pre className="mt-4 rounded bg-neutral-100 p-4 text-xs">{health}</pre>
    </main>
  );
}
