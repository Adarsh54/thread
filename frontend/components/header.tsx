"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X, Settings2, Search, Bot, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/lib/cart-context";
import type { User } from "@supabase/supabase-js";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const { itemCount } = useCart();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header
      className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-5xl transition-all duration-300 ${isScrolled ? "bg-black/70 backdrop-blur-md rounded-full" : "bg-transparent"}`}
      style={{
        boxShadow: isScrolled
          ? "rgba(14, 63, 126, 0.04) 0px 0px 0px 1px, rgba(42, 51, 69, 0.04) 0px 1px 1px -0.5px, rgba(42, 51, 70, 0.04) 0px 3px 3px -1.5px, rgba(42, 51, 70, 0.04) 0px 6px 6px -3px, rgba(14, 63, 126, 0.04) 0px 12px 12px -6px, rgba(14, 63, 126, 0.04) 0px 24px 24px -12px"
          : "none",
      }}
    >
      <div className="flex items-center justify-between transition-all duration-300 px-6 py-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-colors duration-300"
        >
          <Image src="/thread-logo.svg" alt="" width={28} height={28} className="drop-shadow-md" />
          <span className="text-3xl font-bold tracking-tight text-white lowercase drop-shadow-md">
            thread
          </span>
        </Link>

        {/* Desktop Navigation - Centered */}
        <nav className="hidden items-center gap-10 md:flex absolute left-1/2 -translate-x-1/2">
          <Link
            href="/collections"
            className="text-lg font-semibold transition-colors text-white/80 hover:text-white drop-shadow-sm"
          >
            Collections
          </Link>
          <Link
            href="/outfit"
            className="text-lg font-semibold transition-colors text-white/80 hover:text-white drop-shadow-sm"
          >
            Try On
          </Link>
          <Link
            href="/search"
            className="text-lg font-semibold transition-colors text-white/80 hover:text-white drop-shadow-sm"
          >
            Find
          </Link>
          <Link
            href="/agent"
            className="flex items-center gap-1.5 text-lg font-semibold transition-colors text-white/80 hover:text-white drop-shadow-sm"
          >
            <Bot size={18} />
            Thread Bot
          </Link>
        </nav>

        {/* CTA + Auth - Right side */}
        <div className="hidden items-center gap-4 md:flex">
          <button
            onClick={() => {
              if (pathname === "/collections" || pathname === "/search") {
                window.dispatchEvent(new CustomEvent("open-search"));
              } else {
                router.push("/collections");
              }
            }}
            className="p-2.5 rounded-full text-white/80 hover:text-white transition-colors drop-shadow-sm"
            aria-label="Search"
          >
            <Search size={20} />
          </button>
          <Link
            href="/cart"
            className="relative p-2.5 rounded-full text-white/80 hover:text-white transition-colors drop-shadow-sm"
            aria-label="Cart"
          >
            <ShoppingBag size={20} />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black">
                {itemCount > 9 ? "9+" : itemCount}
              </span>
            )}
          </Link>
          {user && (
            <Link
              href="/preferences"
              className="p-2.5 rounded-full text-white/80 hover:text-white transition-colors drop-shadow-sm"
              aria-label="Preferences"
            >
              <Settings2 size={20} />
            </Link>
          )}
          {user ? (
            <button
              onClick={handleSignOut}
              className="px-5 py-2 text-sm font-semibold rounded-full border border-white/30 text-white hover:bg-white/10 transition-all"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/login"
              className="px-6 py-2.5 text-base font-semibold transition-all rounded-full bg-white text-black hover:bg-white/90"
            >
              Get Started
            </Link>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="transition-colors md:hidden text-white drop-shadow-sm"
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="border-t border-border bg-background px-6 py-8 md:hidden rounded-b-2xl">
          <nav className="flex flex-col gap-6">
            <Link
              href="/collections"
              className="text-xl text-foreground"
              onClick={() => setIsMenuOpen(false)}
            >
              Collections
            </Link>
            <Link
              href="/outfit"
              className="text-xl text-foreground"
              onClick={() => setIsMenuOpen(false)}
            >
              Try On
            </Link>
            <Link
              href="/search"
              className="text-xl text-foreground"
              onClick={() => setIsMenuOpen(false)}
            >
              Find
            </Link>
            <Link
              href="/agent"
              className="text-xl text-foreground"
              onClick={() => setIsMenuOpen(false)}
            >
              Thread Bot
            </Link>
            <Link
              href="/cart"
              className="flex items-center gap-2 text-xl text-foreground"
              onClick={() => setIsMenuOpen(false)}
            >
              Cart
              {itemCount > 0 && (
                <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-bold text-background">
                  {itemCount}
                </span>
              )}
            </Link>
            {user ? (
              <>
                <Link
                  href="/preferences"
                  className="text-xl text-foreground"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Preferences
                </Link>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleSignOut();
                  }}
                  className="mt-4 px-5 py-3 text-base font-medium rounded-full border border-foreground/30 text-foreground hover:bg-foreground/10 transition-all"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="mt-4 bg-foreground px-5 py-3.5 text-center text-base font-medium text-background rounded-full"
                onClick={() => setIsMenuOpen(false)}
              >
                Get Started
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
