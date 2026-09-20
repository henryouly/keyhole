import { handle } from "hono/vercel";
import app from "./src/index.js";

// Vercel serverless entry (wired in vercel.json builds/routes).
// Named method exports (not a default export): @vercel/node treats a default
// export as a Node (req, res) handler and IGNORES returned Responses (every
// request hangs to timeout). Named exports use the Web Request/Response path.
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
