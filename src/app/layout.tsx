import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Drinks on Chain", template: "%s · Drinks on Chain" },
  description: "Plantilla de aplicación del ecosistema Drinks on Chain.",
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
