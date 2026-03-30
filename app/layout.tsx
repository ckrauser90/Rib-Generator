import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./components/providers";

export const metadata: Metadata = {
  title: "Rib Generator",
  description: "Verwandle Fotos in 3D-druckbare Rib-Konturen",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}