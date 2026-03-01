import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AccountLockedPage() {
  return (
    <AuthLayout>
      <Card className="border-0 shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle>Account temporarily locked</CardTitle>
          <CardDescription>
            Too many failed sign-in attempts. Your account has been temporarily locked for security.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p>Your account will be automatically unlocked after 15 minutes.</p>
            <p className="mt-2">
              If you believe this is an error, please contact your administrator.
            </p>
          </div>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/forgot-password">Reset your password</Link>
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link href="/login">Try again later</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
