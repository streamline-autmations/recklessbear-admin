import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaSwUpdater } from "@/components/pwa-sw-updater";

export const viewport: Viewport = {
  themeColor: "#0b1f3b",
};

export const metadata: Metadata = {
  title: "reckless admin",
  applicationName: "reckless admin",
  description: "RecklessBear Admin Dashboard",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/pwa-192.png",
        type: "image/png",
        sizes: "192x192",
      },
    ],
    apple: [
      {
        url: "/pwa-192.png",
        type: "image/png",
        sizes: "192x192",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
          storageKey="rb-admin-theme"
        >
          <PwaSwUpdater />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
