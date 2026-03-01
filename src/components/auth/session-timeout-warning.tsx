"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock } from "lucide-react";

interface SessionTimeoutWarningProps {
  remainingMs: number;
  onExtend: () => void;
  onLogout: () => void;
}

export function SessionTimeoutWarning({
  remainingMs,
  onExtend,
  onLogout,
}: SessionTimeoutWarningProps) {
  const [remaining, setRemaining] = React.useState(remainingMs);

  React.useEffect(() => {
    setRemaining(remainingMs);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(interval);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingMs]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="alertdialog"
      aria-labelledby="timeout-title"
      aria-describedby="timeout-description"
    >
      <Card className="w-full max-w-sm animate-fade-in border-0 shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle id="timeout-title" className="text-xl">
            Session expiring
          </CardTitle>
          <CardDescription id="timeout-description">
            Your session will expire in <strong className="text-foreground">{timeDisplay}</strong>{" "}
            due to inactivity.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          For your security, inactive sessions are automatically ended.
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onLogout}>
            Sign out
          </Button>
          <Button className="flex-1" onClick={onExtend} autoFocus>
            Stay signed in
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
