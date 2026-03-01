"use client";

import type { RoleGateProps } from "@/types/auth";
import { useHealthGateContext } from "@/providers/healthgate-provider";

/**
 * Role-based access control component.
 * Renders children only if the current user has ALL specified roles.
 * Optionally renders a fallback if the user lacks required roles.
 */
export function RoleGate({ roles, fallback = null, children }: RoleGateProps) {
  const { roles: userRoles, isAuthenticated } = useHealthGateContext();

  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  const hasAllRoles = roles.every((role) => userRoles.includes(role));

  if (!hasAllRoles) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
