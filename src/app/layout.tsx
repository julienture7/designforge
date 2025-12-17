import "~/styles/globals.css";

import { type Metadata } from "next";
import Script from "next/script";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";

import { TRPCReactProvider } from "~/trpc/react";
import { ToastProvider } from "~/contexts/ToastContext";
import { GoogleAnalytics } from "~/components/GoogleAnalytics";
import { env } from "~/env";

export const metadata: Metadata = {
  title: "DesignForge",
  description: "AI-powered website generation and editing",
  icons: [
    { rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
    { rel: "icon", url: "/favicon.ico", sizes: "32x32" },
  ],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#3b82f6",
          colorBackground: "#ffffff",
          colorText: "#0f172a",
          colorTextSecondary: "#475569",
          colorInputBackground: "#ffffff",
          colorInputText: "#0f172a",
          colorNeutral: "#64748b",
          colorDanger: "#ef4444",
        },
      }}
    >
      <html lang="en" className={`${geist.variable}`}>
        <body className="bg-background text-foreground min-h-screen antialiased">
          {env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID && (
            <>
              <Script
                strategy="afterInteractive"
                src={`https://www.googletagmanager.com/gtag/js?id=${env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}`}
              />
              <Script
                id="google-analytics"
                strategy="afterInteractive"
                dangerouslySetInnerHTML={{
                  __html: `
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}', {
                      page_path: window.location.pathname,
                    });
                  `,
                }}
              />
            </>
          )}
          <TRPCReactProvider>
            <ToastProvider>
              {children}
              {env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID && (
                <Suspense fallback={null}>
                  <GoogleAnalytics />
                </Suspense>
              )}
            </ToastProvider>
          </TRPCReactProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
