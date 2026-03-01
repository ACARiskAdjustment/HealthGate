import Link from "next/link";
import { LogOut } from "lucide-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LogoutPage() {
  return (
    <AuthLayout>
      <Card className="border-0 shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LogOut className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle>Signed out</CardTitle>
          <CardDescription>You have been successfully signed out.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full h-10" asChild>
            <Link href="/login">Sign in again</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
