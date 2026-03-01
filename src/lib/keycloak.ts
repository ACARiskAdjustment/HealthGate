import { getServerEnv } from "@/types/env";

/** Build Keycloak OIDC endpoint URLs */
export function getKeycloakUrls() {
  const env = getServerEnv();
  const base = `${env.KEYCLOAK_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect`;

  return {
    authorization: `${base}/auth`,
    token: `${base}/token`,
    userinfo: `${base}/userinfo`,
    logout: `${base}/logout`,
    certs: `${base}/certs`,
    introspect: `${base}/token/introspect`,
    wellKnown: `${env.KEYCLOAK_URL}/realms/${env.KEYCLOAK_REALM}/.well-known/openid-configuration`,
  };
}

/** Build the OIDC authorization URL with PKCE params */
export function buildAuthorizationUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const env = getServerEnv();
  const urls = getKeycloakUrls();

  const searchParams = new URLSearchParams({
    response_type: "code",
    client_id: env.KEYCLOAK_CLIENT_ID,
    redirect_uri: params.redirectUri,
    scope: "openid email profile",
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });

  return `${urls.authorization}?${searchParams.toString()}`;
}

/** Exchange authorization code for tokens via back-channel */
export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const env = getServerEnv();
  const urls = getKeycloakUrls();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: env.KEYCLOAK_CLIENT_ID,
    client_secret: env.KEYCLOAK_CLIENT_SECRET,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(urls.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/** Refresh an access token using the refresh token */
export async function refreshAccessToken(refreshToken: string) {
  const env = getServerEnv();
  const urls = getKeycloakUrls();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.KEYCLOAK_CLIENT_ID,
    client_secret: env.KEYCLOAK_CLIENT_SECRET,
  });

  const response = await fetch(urls.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/** Keycloak token endpoint response */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  scope: string;
  session_state: string;
}
