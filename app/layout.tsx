import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/shared/navbar";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { CreditsProvider } from "@/lib/contexts/CreditsContext";
import { GenerateProvider } from "@/lib/contexts/GenerateContext";
import { Toaster } from "react-hot-toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: "Visicraft - AI Creative Studio",
  description: "Generate stunning visuals for YouTube, Amazon, and social media with AI",
  keywords: ["AI", "thumbnail generator", "YouTube", "Amazon", "social media", "creative studio"],
  authors: [{ name: "Visicraft" }],
  icons: {
    icon: [{ url: "/new-section/logo.png", type: "image/png" }],
    shortcut: "/new-section/logo.png",
    apple: "/new-section/logo.png",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#1a1d18]`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <CreditsProvider>
            <GenerateProvider>
            <Navbar />
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                duration: 1000,
                style: {
                  background: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #2a2a2a',
                  pointerEvents: 'none',
                },
                success: {
                  duration: 1000,
                },
                error: {
                  duration: 1000,
                },
              }}
            />
            </GenerateProvider>
          </CreditsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
