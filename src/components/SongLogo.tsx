/**
 * Sóng Homestay mark. Renders `public/favicon.svg` itself, so the browser-tab
 * icon and every on-page logo come from one source and cannot drift apart.
 */
export function SongLogo({ className = 'h-10 w-10' }: { className?: string }) {
  return <img src="/favicon.svg" alt="" width={40} height={40} className={`shrink-0 rounded-full ${className}`} aria-hidden="true" />;
}
