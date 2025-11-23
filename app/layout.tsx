import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler";
import { DarkModeProvider } from "@/components/DarkModeProvider";
import { AppUsageBar } from "@/components/AppUsageBar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NeuroFocus Study Tool",
  description:
    "An accessibility-first study aid that converts educational content into neuro-friendly formats",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.variable, "font-sans antialiased")}>
        <DarkModeProvider />
        <GlobalErrorHandler />
        <AppUsageBar />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
