import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LayoutShell } from "@/components/layout/LayoutShell";
import { Providers } from "@/components/providers/Providers";
import { MAIN_CONTENT_ID } from "@/lib/scroll";
import { SURFACE_BOOT_SCRIPT } from "@/lib/surfaces";
import { SHAPE_BOOT_SCRIPT } from "@/lib/shape";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CSM Pro",
  description: "Professional tutoring management and scheduling platform",
  applicationName: "CSM Pro",
  // Installed on an iPhone's home screen, CSM opens full screen under this
  // name. The status bar keeps its default look, dark text on a light bar,
  // because the translucent style always draws white text, which would vanish
  // against the cream header.
  appleWebApp: { capable: true, title: "CSM", statusBarStyle: "default" },
  // Student IDs and lesson numbers are not phone numbers, so iOS shouldn't
  // turn them into links.
  formatDetection: { telephone: false },
};

/**
 * viewport-fit=cover lets the app draw to the edges of a phone with a notch or
 * a home bar, and is what makes env(safe-area-inset-*) report real sizes; the
 * parts that sit at the edges pad themselves by those sizes. The theme colour
 * is the header's, so the browser's bar and an installed app's status bar
 * blend into it. ThemeColorSync keeps it right when someone picks a theme
 * that differs from their phone's.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fef9f3" },
    { media: "(prefers-color-scheme: dark)", color: "#2d2618" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the chosen page background, and the public pages' own shape, before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: SURFACE_BOOT_SCRIPT + SHAPE_BOOT_SCRIPT }} />
      </head>
      <body className={`${inter.className} surface`}>
        {/* Skip navigation link for keyboard accessibility */}
        <a
          href={`#${MAIN_CONTENT_ID}`}
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          Skip to main content
        </a>
        <Providers>
          <LayoutShell>{children}</LayoutShell>
        </Providers>
      </body>
    </html>
  );
}
