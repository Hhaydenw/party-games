import type { Metadata } from "next";
import "./globals.css";
import { SocketProvider } from "@/lib/socketClient";

export const metadata: Metadata = {
  title: "Party Games",
  description: "Invite your friends and play party games together.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-slate-100 antialiased">
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
