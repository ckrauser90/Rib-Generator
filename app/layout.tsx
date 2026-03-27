import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rib Tool Contour Lab",
  description: "Foto hochladen, Kontur erkennen und eine Rib-STL vorbereiten.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
