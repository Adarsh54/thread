import type { Metadata } from "next";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Sign in | thread",
  description: "Sign in or create an account",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-foreground">
      <Header />
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&h=1080&fit=crop)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 pt-24 pb-12">
        <div className="w-full max-w-md rounded-2xl bg-white/10 backdrop-blur-lg border border-white/20 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
