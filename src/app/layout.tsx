import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { PageLoadingOverlay } from "@/components/layout/PageLoadingOverlay";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "iFleet Pro — Fleet Management System",
    template: "%s — iFleet Pro",
  },
  description: "Comprehensive fleet management system for trucking operations — manage trucks, drivers, trips, expenses, maintenance, and more.",
  keywords: ["fleet management", "trucking", "logistics", "iFleet Pro", "fleet tracking", "trip management"],
  authors: [{ name: "iFleet Pro" }],
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "iFleet Pro — Fleet Management System",
    description: "Comprehensive fleet management system for trucking operations.",
    siteName: "iFleet Pro",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "iFleet Pro — Fleet Management System",
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
