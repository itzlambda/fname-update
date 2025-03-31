import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Nunito } from "next/font/google";
import { PT_Sans } from "next/font/google";

import "./globals.css";

export const metadata: Metadata = {
  title: "Farcaster Fname Rename",
  description: "Easily rename your Farcaster username (fname).",
};

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const ptSans = PT_Sans({
  variable: "--font-pt-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} ${ptSans.variable} antialiased relative`}>
        <div className="texture" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
