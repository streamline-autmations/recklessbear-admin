import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import Script from "next/script";

export const metadata: Metadata = {
  title: "RecklessBear Admin",
  description: "RecklessBear Admin Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
          storageKey="rb-admin-theme"
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <div id="VG_OVERLAY_CONTAINER" style={{ width: 0, height: 0 }} />
        <Script id="convocore-config" strategy="afterInteractive">
          {`
(function () {
  window.VG_CONFIG = {
    ID: "NPxTEjBmmvt9M9OAh0s0",
    region: "na",
    render: "bottom-right",
    stylesheets: ["https://vg-bunny-cdn.b-cdn.net/vg_live_build/styles.css"],
  };
})();
          `}
        </Script>
        <Script
          src="https://vg-bunny-cdn.b-cdn.net/vg_live_build/vg_bundle.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
