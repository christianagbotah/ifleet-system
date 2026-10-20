import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { PageLoadingOverlay } from "@/components/layout/PageLoadingOverlay";
import { APP_NAME, APP_PUBLISHER, APP_TAGLINE } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const productTitle = `${APP_NAME} — ${APP_TAGLINE}`;

export const metadata: Metadata = {
  title: {
    default: productTitle,
    template: `%s — ${APP_NAME}`,
  },
  description: "Comprehensive fleet management system for trucking operations — manage trucks, drivers, trips, expenses, maintenance, and more.",
  keywords: ["fleet management", "trucking", "logistics", APP_NAME, "fleet tracking", "trip management"],
  authors: [{ name: APP_PUBLISHER }],
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.png",
  },
  openGraph: {
    title: productTitle,
    description: "Comprehensive fleet management system for trucking operations.",
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: productTitle,
    description: "Comprehensive fleet management system for trucking operations.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <PageLoadingOverlay />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
