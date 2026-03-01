"use client";

import type { UseAuthReturn } from "@/types/auth";
import { useHealthGateContext } from "@/providers/healthgate-provider";

/**
 * SDK-level useAuth() hook.
 * Provides user, authentication state, and auth actions from HealthGateProvider.
 *
 * Must be used within a <HealthGateProvider>.
 */
export function useHealthGateAuth(): UseAuthReturn {
  const ctx = useHealthGateContext();

  return {
    user: ctx.user,
    isAuthenticated: ctx.isAuthenticated,
    isLoading: ctx.isLoading,
    token: ctx.token,
    login: ctx.login,
    logout: ctx.logout,
    refresh: ctx.refresh,
    roles: ctx.roles,
    hasRole: ctx.hasRole,
  };
}
