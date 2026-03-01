import { BrandHeader } from "./brand-header";
import { LegalFooter } from "./legal-footer";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <BrandHeader />
      <main id="main-content" className="w-full max-w-sm">
        {children}
      </main>
      <LegalFooter />
    </div>
  );
}
