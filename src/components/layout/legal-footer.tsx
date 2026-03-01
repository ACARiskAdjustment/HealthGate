export function LegalFooter() {
  return (
    <footer className="mt-8 text-center text-xs text-muted-foreground" role="contentinfo">
      <p>
        Protected by HIPAA-compliant security controls.
      </p>
      <nav className="mt-2 flex items-center justify-center gap-2" aria-label="Legal links">
        <a href="/privacy" className="hover:text-foreground hover:underline">
          Privacy
        </a>
        <span aria-hidden="true">&middot;</span>
        <a href="/terms" className="hover:text-foreground hover:underline">
          Terms
        </a>
        <span aria-hidden="true">&middot;</span>
        <a href="/hipaa-notice" className="hover:text-foreground hover:underline">
          HIPAA Notice
        </a>
      </nav>
    </footer>
  );
}
