import type { Metadata } from "next";
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
