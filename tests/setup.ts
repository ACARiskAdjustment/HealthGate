import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: () => new Map(),
}));

// Mock BroadcastChannel (not available in jsdom)
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(name: string) {
    this.name = name;
  }
  postMessage(_data: unknown) {}
  addEventListener(_type: string, _listener: EventListenerOrEventListenerObject) {}
  removeEventListener(_type: string, _listener: EventListenerOrEventListenerObject) {}
  close() {}
}

vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);

// Mock crypto.subtle for Node.js test environment
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = require("crypto");
  vi.stubGlobal("crypto", webcrypto);
}
