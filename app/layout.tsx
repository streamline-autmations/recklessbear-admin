import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "RecklessBear Admin",
  description: "RecklessBear Admin Dashboard",
  icons: {
    icon: [
      {
        url: "https://res.cloudinary.com/dnlgohkcc/image/upload/v1771311076/Logo-Black_oypd5f.png",
      },
    ],
    apple: [
      {
        url: "https://res.cloudinary.com/dnlgohkcc/image/upload/v1771311076/Logo-Black_oypd5f.png",
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
      </body>
    </html>
  );
}
