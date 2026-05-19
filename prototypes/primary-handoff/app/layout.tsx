import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Primary Section Handoff Prototypes",
  description:
    "Prototype set illustrating the modules primary section asked for. Generic theme, mock data, not production.",
};

const nav = [
  { href: "/checktables", label: "Checktables" },
  { href: "/assessments", label: "Assessments" },
  { href: "/sessions", label: "Sessions & Makeup" },
  { href: "/comms", label: "Parent Comms" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
        <header className="border-b border-ink-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-ink-800 text-white grid place-items-center text-xs font-semibold">
                P
              </div>
              <span className="text-sm font-medium text-ink-800">
                Primary Handoff
              </span>
              <span className="text-xs text-ink-400 hidden sm:inline">
                · prototype
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-md px-3 py-1.5 text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition-colors"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
        <footer className="border-t border-ink-200 mt-12 py-4 text-center text-xs text-ink-400">
          Prototype for internal discussion. Mock data only. No real student
          records.
        </footer>
        </Providers>
      </body>
    </html>
  );
}
