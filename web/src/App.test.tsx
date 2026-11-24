import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseSession, mockSignIn, mockSignOut, mockTrpc } = vi.hoisted(
  () => ({
    mockUseSession: vi.fn(),
    mockSignIn: { social: vi.fn() },
    mockSignOut: vi.fn(),
    mockTrpc: {
      viewer: { me: { query: vi.fn() } },
      connection: {
        status: { query: vi.fn() },
        disconnect: { mutate: vi.fn() },
      },
      keys: {
        list: { query: vi.fn() },
        create: { mutate: vi.fn() },
        revoke: { mutate: vi.fn() },
      },
      audit: {
        recent: { query: vi.fn() },
      },
    },
  }),
);

vi.mock("./lib/auth-client", () => ({
  useSession: () => mockUseSession(),
  signIn: mockSignIn,
  signOut: mockSignOut,
}));

vi.mock("./lib/trpc", () => ({
  trpc: mockTrpc,
}));

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders session loading state", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    render(<App />);
    expect(screen.getByText("Checking session…")).toBeTruthy();
  });

  it("renders login gate and friendly auth error when signed out", () => {
    window.history.replaceState(null, "", "/?error=unable_to_create_user");
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(<App />);

    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeTruthy();
    expect(
      screen.getByText(/This Google account is not authorized for Keyhole/),
    ).toBeTruthy();
    expect(window.location.search).toBe("");
    expect(screen.queryByText("Agent API keys")).toBeNull();
  });

  it("renders dashboard sections for a signed-in admin", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: "admin@example.com" } },
      isPending: false,
    });
    mockTrpc.viewer.me.query.mockResolvedValue({
      email: "admin@example.com",
      name: "Admin",
    });
    mockTrpc.connection.status.query.mockResolvedValue({ connected: false });
    mockTrpc.keys.list.query.mockResolvedValue([]);
    mockTrpc.audit.recent.query.mockResolvedValue([]);

    render(<App />);

    expect(screen.getByText("Signed in as admin@example.com")).toBeTruthy();
    expect(await screen.findByText(/viewer\.me:/)).toBeTruthy();
    expect(await screen.findByText("Not connected.")).toBeTruthy();
    expect(screen.getByText("Agent API keys")).toBeTruthy();
    expect(screen.getByText("Recent agent calls")).toBeTruthy();
    const skillLink = screen.getByRole("link", { name: "SKILL.md" });
    expect(skillLink.getAttribute("href")).toBe("/skill.md");
  });
});
