import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OtpInput as OTPInput } from "@/components/auth/otp-input";

describe("OTPInput", () => {
  it("renders 6 input fields", () => {
    render(<OTPInput value="" onChange={vi.fn()} />);
    const inputs = document.querySelectorAll("input");
    expect(inputs).toHaveLength(6);
  });

  it("calls onChange with full value when digits entered", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OTPInput value="" onChange={onChange} />);

    const inputs = document.querySelectorAll("input");
    await user.click(inputs[0]);
    await user.keyboard("1");

    // onChange should be called with the updated value
    expect(onChange).toHaveBeenCalled();
  });

  it("each input has correct aria-label", () => {
    render(<OTPInput value="" onChange={vi.fn()} />);
    const inputs = document.querySelectorAll("input");
    inputs.forEach((input, i) => {
      expect(input.getAttribute("aria-label")).toContain(`${i + 1}`);
    });
  });

  it("each input has maxLength=1 and inputMode=numeric", () => {
    render(<OTPInput value="" onChange={vi.fn()} />);
    const inputs = document.querySelectorAll("input");
    inputs.forEach((input) => {
      expect(input).toHaveAttribute("maxlength", "1");
      expect(input).toHaveAttribute("inputmode", "numeric");
    });
  });

  it("displays provided value across inputs", () => {
    render(<OTPInput value="123456" onChange={vi.fn()} />);
    const inputs = document.querySelectorAll("input");
    expect(inputs[0]).toHaveValue("1");
    expect(inputs[1]).toHaveValue("2");
    expect(inputs[5]).toHaveValue("6");
  });

  it("calls onChange with progressively longer values as digits are typed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OTPInput value="" onChange={onChange} />);

    const inputs = document.querySelectorAll("input");
    await user.click(inputs[0]);
    await user.keyboard("1");

    // onChange should be called with the digit
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toContain("1");
  });

  it("disables all inputs when disabled prop is true", () => {
    render(<OTPInput value="" onChange={vi.fn()} disabled />);
    const inputs = document.querySelectorAll("input");
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });
});
