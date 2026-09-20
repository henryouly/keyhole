import { readFileSync } from "node:fs";

/** Single source: repo-root SKILL.md. Served at /skill.md. */
export function skillMarkdown(): string {
  return readFileSync(new URL("../../../SKILL.md", import.meta.url), "utf8");
}
