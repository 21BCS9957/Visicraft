import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/shared/navbar";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { CreditsProvider } from "@/lib/contexts/CreditsContext";
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
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
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
            <Navbar />
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #2a2a2a',
                },
              }}
            />
          </CreditsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
