import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { TRPCReactProvider } from "~/trpc/react";
import { ToastProvider } from "~/contexts/ToastContext";

export const metadata: Metadata = {
  title: "AIDesigner",
  description: "AI-powered website generation and editing",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
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
          <TRPCReactProvider>
            <ToastProvider>{children}</ToastProvider>
          </TRPCReactProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
