"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormBannerProps {
  message: string;
  variant?: "error" | "success" | "info";
  className?: string;
}

const variantStyles = {
  error: {
    container: "bg-destructive/10 border-destructive/20 text-destructive",
    icon: AlertCircle,
  },
  success: {
    container: "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400",
    icon: CheckCircle2,
  },
  info: {
    container: "bg-primary/10 border-primary/20 text-foreground",
    icon: Info,
  },
};

export function FormBanner({ message, variant = "error", className }: FormBannerProps) {
  const { container, icon: Icon } = variantStyles[variant];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm animate-slide-down",
        container,
        className,
      )}
      role={variant === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
