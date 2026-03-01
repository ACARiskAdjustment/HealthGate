/**
 * @healthgate/react — Developer SDK barrel exports.
 *
 * Usage:
 *   import { HealthGateProvider, useAuth, useSession, withAuth, RoleGate } from '@healthgate/react';
 *
 * In the HealthGate monorepo, import from '@/sdk':
 *   import { HealthGateProvider, useAuth, useSession, withAuth, RoleGate } from '@/sdk';
 */

// --- Provider ---
export { HealthGateProvider, useHealthGateContext } from "@/providers/healthgate-provider";

// --- Hooks ---
export { useHealthGateAuth as useAuth } from "@/hooks/use-healthgate-auth";
export { useSession } from "@/hooks/use-session";

// --- Components ---
export { HealthGateLogin } from "@/components/auth/healthgate-login";
export { withAuth } from "@/components/auth/with-auth";
export { RoleGate } from "@/components/auth/role-gate";
export { UserMenu } from "@/components/auth/user-menu";
export { SessionTimeoutWarning } from "@/components/auth/session-timeout-warning";

// --- Types ---
export type {
  HealthGateUser,
  HealthGateError,
  HealthGateErrorCode,
  HealthGateConfig,
  HealthGateProviderProps,
  HealthGateLoginProps,
  HealthGateContextValue,
  UseAuthReturn,
  UseSessionReturn,
  WithAuthOptions,
  RoleGateProps,
  LoginOptions,
} from "@/types/auth";
