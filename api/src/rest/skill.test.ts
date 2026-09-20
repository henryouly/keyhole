import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { skillMarkdown } from "./skill.js";

describe("skill", () => {
  it("serves the repo-root SKILL.md verbatim with agent frontmatter", () => {
    const onDisk = readFileSync(
      new URL("../../../SKILL.md", import.meta.url),
      "utf8",
    );
    expect(skillMarkdown()).toBe(onDisk);
    expect(onDisk.startsWith("---\nname: keyhole-calendar")).toBe(true);
    expect(onDisk).toContain("kh_live_");
    expect(onDisk).toContain("/api/openapi.json");
  });
});
