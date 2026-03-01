import Link from "next/link";

interface BrandHeaderProps {
  variant?: "default" | "compact";
}

export function BrandHeader({ variant = "default" }: BrandHeaderProps) {
  const isCompact = variant === "compact";

  return (
    <div className={isCompact ? "flex items-center gap-2" : "mb-8 flex items-center gap-3"}>
      <Link
        href="/"
        className="flex items-center gap-2 no-underline"
        aria-label="HealthGate home"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isCompact ? "h-6 w-6 text-primary" : "h-8 w-8 text-primary"}
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <span
          className={
            isCompact
              ? "font-heading text-lg font-normal tracking-[-0.02em] text-foreground"
              : "font-heading text-2xl font-normal tracking-[-0.02em] text-foreground"
          }
        >
          HealthGate
        </span>
      </Link>
    </div>
  );
}
