import Link from "next/link";
import { Clock } from "lucide-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SessionExpiredPage() {
  return (
    <AuthLayout>
      <Card className="border-0 shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle>Session expired</CardTitle>
          <CardDescription>
            Your session has ended due to inactivity. Please sign in again to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full h-10" asChild>
            <Link href="/login">Sign in again</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            For your security, sessions are automatically ended after a period of inactivity.
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
