/** Core user type returned by the session endpoint */
export interface HealthGateUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  givenName: string;
  familyName: string;
  preferredUsername: string;
  realmRoles: string[];
  clientRoles: Record<string, string[]>;
}

/** GET /api/auth/session response */
export interface SessionStatusResponse {
  authenticated: boolean;
  user: HealthGateUser | null;
  expiresAt: string | null;
  idleTimeoutMs: number | null;
  maxLifetimeMs: number | null;
  sessionStartedAt: string | null;
}

/** POST /api/auth/refresh response */
export interface AuthRefreshResponse {
  expiresAt: string;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
}

/** POST /api/auth/callback request */
export interface AuthCallbackRequest {
  code: string;
  state: string;
}

/** POST /api/auth/logout request */
export interface LogoutRequest {
  csrf_token: string;
}

/** GET /api/auth/csrf response */
export interface CsrfResponse {
  token: string;
}

/** POST /api/auth/login request */
export interface LoginRequest {
  email: string;
  password: string;
  csrf_token: string;
}

/** POST /api/auth/mfa request */
export interface MfaRequest {
  totp_code: string;
  remember_device?: boolean;
  csrf_token: string;
}

/** POST /api/auth/mfa-setup response */
export interface MfaSetupResponse {
  recovery_codes: string[];
}

/** POST /api/auth/forgot-password request */
export interface ForgotPasswordRequest {
  email: string;
  csrf_token: string;
}

/** POST /api/auth/reset-password request */
export interface ResetPasswordRequest {
  password: string;
  confirm_password: string;
  token: string;
  csrf_token: string;
}

// ---------------------------------------------------------------------------
// SDK Types (@healthgate/react)
// ---------------------------------------------------------------------------

/** Error codes emitted by HealthGate SDK */
export type HealthGateErrorCode =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "MFA_REQUIRED"
  | "MFA_INVALID"
  | "SESSION_EXPIRED"
  | "TOKEN_REFRESH_FAILED"
  | "KEYCLOAK_UNREACHABLE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NETWORK_ERROR"
  | "UNKNOWN";

/** Structured error type for all SDK operations */
export interface HealthGateError {
  code: HealthGateErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** SDK configuration passed to HealthGateProvider */
export interface HealthGateConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  idleTimeoutMinutes: number;
  sessionWarningMinutes: number;
  onSessionExpired?: () => void;
  onAuthError?: (error: HealthGateError) => void;
}

/** Options for the login() method */
export interface LoginOptions {
  redirectUri?: string;
}

/** Return value of useAuth() hook */
export interface UseAuthReturn {
  user: HealthGateUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: (options?: LoginOptions) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  roles: string[];
  hasRole: (roleName: string) => boolean;
}

/** Return value of useSession() hook */
export interface UseSessionReturn {
  expiresAt: Date | null;
  idleTimeRemaining: number;
  isSessionWarningVisible: boolean;
  extendSession: () => Promise<void>;
  dismissAndLogout: () => void;
}

/** Props for HealthGateProvider */
export interface HealthGateProviderProps {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  idleTimeoutMinutes?: number;
  sessionWarningMinutes?: number;
  onSessionExpired?: () => void;
  onAuthError?: (error: HealthGateError) => void;
  loginUrl?: string;
  children: React.ReactNode;
}

/** Full context value exposed by HealthGateProvider */
export interface HealthGateContextValue extends UseAuthReturn {
  session: UseSessionReturn;
  config: HealthGateConfig;
}

/** Props for HealthGateLogin embeddable component */
export interface HealthGateLoginProps {
  appName?: string;
  showSSO?: boolean;
  showRegistration?: boolean;
  onSuccess?: (user: HealthGateUser) => void;
  onError?: (error: HealthGateError) => void;
  redirectUri?: string;
  className?: string;
  logo?: React.ReactNode;
  footerContent?: React.ReactNode;
}

/** Options for withAuth() HOC */
export interface WithAuthOptions {
  requiredRoles?: string[];
  loginUrl?: string;
  unauthorizedUrl?: string;
  loadingComponent?: React.ComponentType;
}

/** Props for RoleGate component */
export interface RoleGateProps {
  roles: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}
