"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;

export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_ID) return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");

    // Track page view
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("config", GA_ID, {
        page_path: url,
      });
    }
  }, [pathname, searchParams]);

  return null;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    gtag: (
      command: string,
      targetId: string,
      config?: {
        page_path?: string;
        [key: string]: unknown;
      }
    ) => void;
    dataLayer: unknown[];
  }
}

