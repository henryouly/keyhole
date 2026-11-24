import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuditRecent } = vi.hoisted(() => ({
  mockAuditRecent: vi.fn(),
}));

vi.mock("./lib/trpc", () => ({
  trpc: {
    audit: {
      recent: { query: mockAuditRecent },
    },
  },
}));

import Audit from "./Audit";

describe("Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders empty state when no agent calls exist", async () => {
    mockAuditRecent.mockResolvedValue([]);
    render(<Audit />);
    expect(await screen.findByText("No calls yet.")).toBeTruthy();
  });

  it("renders recent agent calls table", async () => {
    mockAuditRecent.mockResolvedValue([
      {
        apiKeyPrefix: "kh_live_abcd",
        method: "GET",
        path: "/api/v1/ping",
        status: 200,
        ms: 12,
        createdAt: new Date("2026-09-25T10:00:00Z"),
      },
    ]);
    render(<Audit />);
    expect(await screen.findByText("kh_live_abcd")).toBeTruthy();
    expect(screen.getByText("/api/v1/ping")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
  });

  it("renders error banner when audit query fails", async () => {
    mockAuditRecent.mockRejectedValue(new Error("FORBIDDEN"));
    render(<Audit />);
    expect(await screen.findByText("FORBIDDEN")).toBeTruthy();
  });
});
