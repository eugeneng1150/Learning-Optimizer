import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Learning Optimizer",
  description: "AI-powered concept graph, study queue, and quiz engine for university learning."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
