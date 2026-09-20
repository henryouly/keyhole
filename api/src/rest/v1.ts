import { Hono } from "hono";
import {
  createAgentMiddleware,
  requireAgentScope,
  type AgentEnv,
} from "./agent-auth.js";

const v1 = new Hono<AgentEnv>();

v1.use("/*", createAgentMiddleware());

// Connectivity probe for agents (and the 401/403/429 matrix test).
// Kept: doubles as a cheap "is my key alive" check in SKILL.md.
v1.get("/ping", requireAgentScope("calendar:read"), (c) => {
  const agent = c.get("agent");
  return c.json({ ok: true, key: agent.prefix, scopes: agent.scopes });
});

export default v1;
