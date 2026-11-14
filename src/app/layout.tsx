import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { ServiceWorker } from "@/components/shell/ServiceWorker";

export const metadata: Metadata = {
  title: { default: "AUCTION IQ — Intelligent IPL-style auction platform", template: "%s · AUCTION IQ" },
  description:
    "Run IPL-style auctions for college fests and give every participant live purse tracking, competitor intelligence, smart bids and what-if simulation.",
  applicationName: "AUCTION IQ",
  appleWebApp: { capable: true, title: "AUCTION IQ", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: "/icons/apple-touch-icon.png",
  },
};
export const viewport: Viewport = { themeColor: "#09090b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-fg">
        {children}
        <Toaster theme="dark" position="top-right" richColors closeButton />
        <ServiceWorker />
      </body>
    </html>
  );
}
