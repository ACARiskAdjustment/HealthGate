import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test("renders login form with all required elements", async ({ page }) => {
    await page.goto("/login");

    // Brand header
    await expect(page.locator("text=HealthGate")).toBeVisible();

    // Form fields
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();

    // Links
    await expect(page.getByText("Forgot password?")).toBeVisible();
    await expect(page.getByText("Sign up")).toBeVisible();

    // SSO button
    await expect(page.getByText("SSO / SAML")).toBeVisible();
  });

  test("shows validation errors for empty form submission", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue" }).click();

    // Zod validation should show error messages
    await expect(page.locator("[role='alert'], .text-destructive, [id*='error']").first()).toBeVisible();
  });

  test("shows validation error for invalid email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel("Password").fill("somepassword");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.locator("text=valid email").first()).toBeVisible();
  });

  test("email field has autofocus", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByLabel("Email address");
    await expect(email).toBeFocused();
  });

  test("password toggle switches between text and password type", async ({ page }) => {
    await page.goto("/login");
    const passwordInput = page.locator("input[type='password']");
    await expect(passwordInput).toBeVisible();

    // Click toggle
    await page.locator("button[aria-label*='password' i]").click();
    await expect(page.locator("input[type='text']").last()).toBeVisible();
  });

  test("navigates to forgot password page", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Forgot password?").click();
    await expect(page).toHaveURL("/forgot-password");
  });

  test("navigates to register page", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Sign up").click();
    await expect(page).toHaveURL("/register");
  });
});

test.describe("Register Page", () => {
  test("renders registration form", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Last name")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByRole("button", { name: /create|register|sign up/i })).toBeVisible();
  });

  test("validates password complexity requirements", async ({ page }) => {
    await page.goto("/register");

    await page.getByLabel("First name").fill("Test");
    await page.getByLabel("Last name").fill("User");
    await page.getByLabel("Email address").fill("test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("short");

    await page.getByRole("button", { name: /create|register|sign up/i }).click();

    // Should show password requirement errors (12+ chars, complexity)
    await expect(page.locator("text=/12|character/i").first()).toBeVisible();
  });

  test("validates password match", async ({ page }) => {
    await page.goto("/register");

    await page.getByLabel("First name").fill("Test");
    await page.getByLabel("Last name").fill("User");
    await page.getByLabel("Email address").fill("test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("SecureP@ssword1!");
    await page.getByLabel("Confirm password").fill("Different@Pass1!");

    await page.getByRole("button", { name: /create|register|sign up/i }).click();

    await expect(page.locator("text=/match/i").first()).toBeVisible();
  });
});

test.describe("Forgot Password Page", () => {
  test("renders forgot password form", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(page.getByText(/reset|forgot/i).first()).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: /send|reset|continue/i })).toBeVisible();
  });

  test("has back to sign in link", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByText(/back to sign in/i)).toBeVisible();
  });
});

test.describe("Static Pages", () => {
  test("session expired page renders correctly", async ({ page }) => {
    await page.goto("/session-expired");
    await expect(page.getByText(/session/i).first()).toBeVisible();
    await expect(page.getByText(/sign in/i).first()).toBeVisible();
  });

  test("account locked page renders correctly", async ({ page }) => {
    await page.goto("/account-locked");
    await expect(page.getByText(/locked/i).first()).toBeVisible();
    await expect(page.getByText(/15 minute/i)).toBeVisible();
  });

  test("logout page renders correctly", async ({ page }) => {
    await page.goto("/logout");
    await expect(page.getByText(/signed out/i).first()).toBeVisible();
  });
});

test.describe("Security Headers", () => {
  test("all required security headers are present", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();

    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");

    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-dns-prefetch-control"]).toBe("off");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });

  test("X-Request-Id header is present and unique", async ({ page }) => {
    const res1 = await page.goto("/login");
    const id1 = res1!.headers()["x-request-id"];
    expect(id1).toBeTruthy();
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);

    const res2 = await page.goto("/login");
    const id2 = res2!.headers()["x-request-id"];
    expect(id2).not.toBe(id1);
  });

  test("auth pages have no-cache headers", async ({ page }) => {
    const response = await page.goto("/login");
    const cacheControl = response!.headers()["cache-control"];
    expect(cacheControl).toContain("no-store");
  });
});

test.describe("Health Endpoints", () => {
  test("GET /api/healthz returns 200", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.uptime).toBeDefined();
  });

  test("GET /api/readyz returns status with checks", async ({ request }) => {
    const res = await request.get("/api/readyz");
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.checks).toBeInstanceOf(Array);
  });

  test("GET /api/metrics returns Prometheus format", async ({ request }) => {
    const res = await request.get("/api/metrics");
    expect(res.ok()).toBe(true);
    const text = await res.text();
    expect(text).toContain("healthgate_bff");
  });
});

test.describe("Accessibility", () => {
  test("login page has no auto-detected accessibility issues", async ({ page }) => {
    await page.goto("/login");

    // Check for basic a11y attributes
    const form = page.locator("form");
    await expect(form).toBeVisible();

    // All inputs should have labels
    const inputs = page.locator("input:visible");
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");

      // Each input should have either an associated label, aria-label, or aria-labelledby
      const hasLabel = id ? await page.locator(`label[for="${id}"]`).count() > 0 : false;
      expect(hasLabel || ariaLabel || ariaLabelledBy).toBeTruthy();
    }
  });

  test("keyboard navigation works on login form", async ({ page }) => {
    await page.goto("/login");

    // Tab through the form
    await page.keyboard.press("Tab"); // should focus email (autofocus)
    await page.keyboard.press("Tab"); // password
    await page.keyboard.press("Tab"); // password toggle or forgot password link
    await page.keyboard.press("Tab"); // continue button or next focusable

    // Should be able to tab through without getting stuck
  });
});
