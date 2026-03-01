/** Server-side environment variables — validated at startup */
export interface ServerEnv {
  KEYCLOAK_URL: string;
  KEYCLOAK_REALM: string;
  KEYCLOAK_CLIENT_ID: string;
  KEYCLOAK_CLIENT_SECRET: string;
  NEXTAUTH_URL: string;
  COOKIE_ENCRYPTION_KEY: string;
  NODE_ENV: "development" | "staging" | "production";
}

export function getServerEnv(): ServerEnv {
  const env: ServerEnv = {
    KEYCLOAK_URL: requireEnv("KEYCLOAK_URL"),
    KEYCLOAK_REALM: requireEnv("KEYCLOAK_REALM"),
    KEYCLOAK_CLIENT_ID: requireEnv("KEYCLOAK_CLIENT_ID"),
    KEYCLOAK_CLIENT_SECRET: requireEnv("KEYCLOAK_CLIENT_SECRET"),
    NEXTAUTH_URL: requireEnv("NEXTAUTH_URL"),
    COOKIE_ENCRYPTION_KEY: requireEnv("COOKIE_ENCRYPTION_KEY"),
    NODE_ENV: (process.env.NODE_ENV as ServerEnv["NODE_ENV"]) || "development",
  };
  return env;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
