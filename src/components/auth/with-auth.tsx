"use client";

import * as React from "react";
import type { HealthGateUser, WithAuthOptions } from "@/types/auth";
import { useHealthGateContext } from "@/providers/healthgate-provider";
import { ShieldAlert } from "lucide-react";

function DefaultLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function DefaultUnauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <ShieldAlert className="h-12 w-12 text-destructive" />
      <h1 className="font-heading text-2xl">Access Denied</h1>
      <p className="text-muted-foreground">
        You do not have permission to access this page.
      </p>
    </div>
  );
}

/**
 * Higher-order component that protects a page component.
 * Redirects to login if unauthenticated.
 * Shows 403 if authenticated but missing required roles.
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P & { user: HealthGateUser }>,
  options?: WithAuthOptions,
): React.ComponentType<P> {
  const {
    requiredRoles = [],
    loginUrl = "/login",
    unauthorizedUrl,
    loadingComponent: LoadingComponent,
  } = options ?? {};

  const Loading = LoadingComponent ?? DefaultLoading;

  function WrappedComponent(props: P) {
    const { user, isAuthenticated, isLoading, roles } = useHealthGateContext();

    if (isLoading) {
      return <Loading />;
    }

    if (!isAuthenticated || !user) {
      if (typeof window !== "undefined") {
        window.location.href = loginUrl;
      }
      return <Loading />;
    }

    // Check required roles
    if (requiredRoles.length > 0) {
      const hasAllRoles = requiredRoles.every((role) => roles.includes(role));
      if (!hasAllRoles) {
        if (unauthorizedUrl && typeof window !== "undefined") {
          window.location.href = unauthorizedUrl;
          return <Loading />;
        }
        return <DefaultUnauthorized />;
      }
    }

    return <Component {...props} user={user} />;
  }

  WrappedComponent.displayName = `withAuth(${Component.displayName || Component.name || "Component"})`;
  return WrappedComponent;
}
