import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentCard | Treasury Overview",
  description: "Read-only view of AgentCard payments and on-chain spending limits on Solana devnet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
