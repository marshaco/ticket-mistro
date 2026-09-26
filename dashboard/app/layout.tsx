import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrediTally | Overview",
  description: "CrediTally: AI credit usage and agent spending, with limits enforced on-chain on Solana.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
