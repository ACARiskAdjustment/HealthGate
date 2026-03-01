"use client";

import type { UseSessionReturn } from "@/types/auth";
import { useHealthGateContext } from "@/providers/healthgate-provider";

/**
 * SDK-level useSession() hook.
 * Provides session expiry info, idle time remaining, warning visibility, and session actions.
 *
 * Must be used within a <HealthGateProvider>.
 */
export function useSession(): UseSessionReturn {
  const ctx = useHealthGateContext();
  return ctx.session;
}
