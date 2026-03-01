import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleGate } from "@/components/auth/role-gate";

// Mock the provider context
const mockContextValue = {
  user: {
    sub: "user-1",
    email: "test@example.com",
    emailVerified: true,
    name: "Test User",
    givenName: "Test",
    familyName: "User",
    preferredUsername: "testuser",
    realmRoles: ["clinician"],
    clientRoles: { "healthgate-dev": ["admin"] },
  },
  isAuthenticated: true,
  isLoading: false,
  token: "mock-token",
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  roles: ["clinician", "admin"],
  hasRole: (role: string) => ["clinician", "admin"].includes(role),
  session: {
    expiresAt: null,
    idleTimeRemaining: 900000,
    isSessionWarningVisible: false,
    extendSession: vi.fn(),
    dismissAndLogout: vi.fn(),
  },
  config: {
    keycloakUrl: "http://localhost:8080",
    realm: "test",
    clientId: "test",
    idleTimeoutMinutes: 15,
    sessionWarningMinutes: 2,
  },
};

vi.mock("@/providers/healthgate-provider", () => ({
  useHealthGateContext: () => mockContextValue,
}));

describe("RoleGate", () => {
  it("renders children when user has required roles", () => {
    render(
      <RoleGate roles={["clinician"]}>
        <div>Protected Content</div>
      </RoleGate>,
    );
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("renders fallback when user lacks required roles", () => {
    render(
      <RoleGate roles={["superadmin"]} fallback={<div>No Access</div>}>
        <div>Protected Content</div>
      </RoleGate>,
    );
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.getByText("No Access")).toBeInTheDocument();
  });

  it("requires ALL specified roles", () => {
    render(
      <RoleGate roles={["clinician", "superadmin"]}>
        <div>Admin Only</div>
      </RoleGate>,
    );
    // User has "clinician" but not "superadmin"
    expect(screen.queryByText("Admin Only")).not.toBeInTheDocument();
  });

  it("renders nothing (no fallback) when role check fails without fallback", () => {
    const { container } = render(
      <RoleGate roles={["nonexistent"]}>
        <div>Hidden</div>
      </RoleGate>,
    );
    expect(container.textContent).toBe("");
  });
});
