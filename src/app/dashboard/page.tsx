"use client";

import type { HealthGateUser } from "@/types/auth";
import { withAuth } from "@/components/auth/with-auth";
import { UserMenu } from "@/components/auth/user-menu";
import { RoleGate } from "@/components/auth/role-gate";
import { BrandHeader } from "@/components/layout/brand-header";

function DashboardPage({ user }: { user: HealthGateUser }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b p-4">
        <BrandHeader variant="compact" />
        <UserMenu />
      </header>

      <main className="mx-auto max-w-4xl p-8">
        <h1 className="font-heading text-2xl">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          You&apos;re signed in as {user.name}.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-6 shadow-card">
            <h2 className="font-heading text-lg">Your Profile</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd>{user.givenName} {user.familyName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Roles</dt>
                <dd>{user.realmRoles.join(", ") || "—"}</dd>
              </div>
            </dl>
          </div>

          <RoleGate
            roles={["healthgate-admin"]}
            fallback={
              <div className="rounded-lg border bg-card p-6 shadow-card">
                <h2 className="font-heading text-lg">Quick Actions</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Standard user actions will appear here.
                </p>
              </div>
            }
          >
            <div className="rounded-lg border bg-card p-6 shadow-card">
              <h2 className="font-heading text-lg">Admin Panel</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Admin-only actions and user management.
              </p>
            </div>
          </RoleGate>
        </div>
      </main>
    </div>
  );
}

export default withAuth(DashboardPage);
