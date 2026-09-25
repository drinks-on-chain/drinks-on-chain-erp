import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ERP · Drinks on Chain", template: "%s · ERP · Drinks on Chain" },
  description: "ERP de trazabilidad de las bodegas de Drinks on Chain.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" data-theme="oro">
      <body className="min-h-dvh bg-bg font-ui text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
