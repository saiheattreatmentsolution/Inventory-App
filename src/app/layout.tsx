import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { DataErrorNotice } from "@/components/SetupNotice";
import { THEME_SCRIPT } from "@/components/ThemeToggle";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sai Group inventory",
  description: "Stock in, stock out and running balance for Sai Group heat-treatment equipment.",
};

export const viewport: Viewport = {
  // Matches the app bar in each theme, so the phone's status bar blends in.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#171c30" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint, so dark mode never flashes white. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <AuthGate>
            <StoreProvider>
              <AppShell>
                <DataErrorNotice />
                {children}
              </AppShell>
            </StoreProvider>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
