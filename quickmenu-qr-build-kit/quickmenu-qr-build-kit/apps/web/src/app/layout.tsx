import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "./service-worker-registrar";

export const viewport: Viewport = {
  themeColor: "#1f2937",
};

export const metadata: Metadata = {
  title: "QuickMenu QR",
  description: "Scan the table QR code to browse the menu and order.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}