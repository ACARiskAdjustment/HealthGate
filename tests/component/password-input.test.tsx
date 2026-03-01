import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Eye: (props: Record<string, unknown>) => <span data-testid="icon-eye" {...props} />,
  EyeOff: (props: Record<string, unknown>) => <span data-testid="icon-eyeoff" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <span {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <span {...props} />,
  Info: (props: Record<string, unknown>) => <span {...props} />,
  Shield: (props: Record<string, unknown>) => <span {...props} />,
  ArrowLeft: (props: Record<string, unknown>) => <span {...props} />,
  Mail: (props: Record<string, unknown>) => <span {...props} />,
  Loader2: (props: Record<string, unknown>) => <span {...props} />,
}));

import { PasswordInput } from "@/components/auth/password-input";

describe("PasswordInput", () => {
  it("renders as password type by default", () => {
    render(<PasswordInput />);
    const input = document.querySelector("input")!;
    expect(input).toHaveAttribute("type", "password");
  });

  it("toggles visibility when eye button is clicked", async () => {
    const user = userEvent.setup();
    render(<PasswordInput />);

    const input = document.querySelector("input")!;
    expect(input.type).toBe("password");

    const toggle = screen.getByRole("button");
    await user.click(toggle);
    expect(input.type).toBe("text");

    await user.click(toggle);
    expect(input.type).toBe("password");
  });

  it("toggle button has tabIndex -1 (not in tab order)", () => {
    render(<PasswordInput />);
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("tabindex", "-1");
  });

  it("auto-hides password after specified delay", async () => {
    vi.useFakeTimers();
    render(<PasswordInput autoHideAfterMs={5000} />);

    const input = document.querySelector("input")!;
    const toggle = screen.getByRole("button");

    // Show password
    await act(async () => {
      toggle.click();
    });
    expect(input.type).toBe("text");

    // Advance past auto-hide timer
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(input.type).toBe("password");

    vi.useRealTimers();
  });

  it("has correct aria-label on toggle button", () => {
    render(<PasswordInput />);
    const toggle = screen.getByRole("button");
    expect(toggle.getAttribute("aria-label")).toMatch(/password/i);
  });
});
