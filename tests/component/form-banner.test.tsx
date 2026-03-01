import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock lucide-react icons to avoid SVG rendering issues in jsdom
vi.mock("lucide-react", () => ({
  AlertCircle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  Info: (props: Record<string, unknown>) => <span data-testid="icon-info" {...props} />,
  Eye: (props: Record<string, unknown>) => <span data-testid="icon-eye" {...props} />,
  EyeOff: (props: Record<string, unknown>) => <span data-testid="icon-eyeoff" {...props} />,
  Shield: (props: Record<string, unknown>) => <span data-testid="icon-shield" {...props} />,
  ArrowLeft: (props: Record<string, unknown>) => <span data-testid="icon-arrow-left" {...props} />,
  Mail: (props: Record<string, unknown>) => <span data-testid="icon-mail" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
}));

import { FormBanner } from "@/components/auth/form-banner";

describe("FormBanner", () => {
  it("renders error message", () => {
    render(<FormBanner message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders with error variant by default (role=alert)", () => {
    render(<FormBanner message="Error occurred" />);
    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
  });

  it("renders with success variant (role=status)", () => {
    render(<FormBanner message="Operation successful" variant="success" />);
    expect(screen.getByText("Operation successful")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders with info variant (role=status)", () => {
    render(<FormBanner message="Please note" variant="info" />);
    expect(screen.getByText("Please note")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has appropriate ARIA role for error variant", () => {
    render(<FormBanner message="Alert message" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
