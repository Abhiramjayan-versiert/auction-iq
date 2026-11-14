import Link from "next/link";
import { Logo } from "@/components/shell/Logo";
import { buttonVariants } from "@/components/ui/button";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/"><Logo /></Link>
          <nav className="hidden gap-5 text-sm text-muted md:flex">
            <Link href="/features" className="hover:text-fg">Features</Link>
            <Link href="/how-it-works" className="hover:text-fg">How it works</Link>
            <Link href="/events" className="hover:text-fg">Events</Link>
            <Link href="/join" className="hover:text-fg">Join auction</Link>
          </nav>
          <div className="ml-auto flex gap-2">
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Log in</Link>
            <Link href="/register" className={buttonVariants({ size: "sm" })}>Get started</Link>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line/60 py-8 text-center text-xs text-faint">
        AUCTION IQ · Decision support for auction events. Official results are always recorded by the event auctioneer.
      </footer>
    </div>
  );
}
