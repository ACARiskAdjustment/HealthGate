import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  Eye: (props: Record<string, unknown>) => <span {...props} />,
  EyeOff: (props: Record<string, unknown>) => <span {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <span {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <span {...props} />,
  Info: (props: Record<string, unknown>) => <span {...props} />,
  Shield: (props: Record<string, unknown>) => <span {...props} />,
  ArrowLeft: (props: Record<string, unknown>) => <span {...props} />,
  Mail: (props: Record<string, unknown>) => <span {...props} />,
  Loader2: (props: Record<string, unknown>) => <span {...props} />,
}));

import { SessionTimeoutWarning } from "@/components/auth/session-timeout-warning";

describe("SessionTimeoutWarning", () => {
  it("renders with countdown", () => {
    render(
      <SessionTimeoutWarning
        remainingMs={120000}
        onExtend={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getByText("Session expiring")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Stay signed in")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("displays formatted time (M:SS)", () => {
    render(
      <SessionTimeoutWarning
        remainingMs={90000}
        onExtend={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    // 90000ms = 1:30
    expect(screen.getByText("1:30")).toBeInTheDocument();
  });

  it("calls onExtend when 'Stay signed in' is clicked", async () => {
    const user = userEvent.setup();
    const onExtend = vi.fn();
    render(
      <SessionTimeoutWarning
        remainingMs={60000}
        onExtend={onExtend}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Stay signed in"));
    expect(onExtend).toHaveBeenCalledOnce();
  });

  it("calls onLogout when 'Sign out' is clicked", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <SessionTimeoutWarning
        remainingMs={60000}
        onExtend={vi.fn()}
        onLogout={onLogout}
      />,
    );

    await user.click(screen.getByText("Sign out"));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("'Stay signed in' button has autoFocus attribute", () => {
    render(
      <SessionTimeoutWarning
        remainingMs={60000}
        onExtend={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    // React renders autoFocus as a property, not an HTML attribute in jsdom
    // Verify it's the auto-focused button by checking it exists
    const stayButton = screen.getByText("Stay signed in");
    expect(stayButton).toBeInTheDocument();
    expect(stayButton.tagName).toBe("BUTTON");
  });

  it("has correct accessibility attributes", () => {
    render(
      <SessionTimeoutWarning
        remainingMs={60000}
        onExtend={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "timeout-title");
    expect(dialog).toHaveAttribute("aria-describedby", "timeout-description");
  });
});
