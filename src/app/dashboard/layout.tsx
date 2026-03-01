"use client";

import { HealthGateProvider } from "@/providers/healthgate-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HealthGateProvider
      keycloakUrl={process.env.NEXT_PUBLIC_KEYCLOAK_URL || "http://localhost:8080"}
      realm={process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "healthgate-clinician"}
      clientId={process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "healthgate-dev"}
      idleTimeoutMinutes={15}
      sessionWarningMinutes={2}
      onSessionExpired={() => {
        window.location.href = "/session-expired";
      }}
    >
      {children}
    </HealthGateProvider>
  );
}
