import { handle } from "hono/vercel";
import app from "./src/index.js";

// Vercel serverless entry (wired in vercel.json builds/routes).
// All /api/* and /trpc/* traffic lands here; static assets come from web/dist.
export default handle(app);
