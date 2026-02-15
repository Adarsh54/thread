"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Header } from "@/components/header";
import { useCart } from "@/lib/cart-context";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, clearCart, itemCount, total } = useCart();

  return (
    <main className="min-h-screen bg-background pb-24">
      <Header />
      <div className="pt-28" />

      <div className="mx-auto max-w-4xl px-6 md:px-12">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ShoppingBag size={28} className="text-foreground" />
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Cart
          </h1>
          {itemCount > 0 && (
            <span className="rounded-full bg-foreground px-2.5 py-0.5 text-xs font-semibold text-background">
              {itemCount}
            </span>
          )}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            <ShoppingBag size={48} className="text-muted-foreground/30" />
            <p className="mt-4 text-lg text-muted-foreground">Your cart is empty</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Find items you love using Thread Bot or browse collections.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => router.push("/agent")}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity"
              >
                Thread Bot
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => router.push("/collections")}
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Browse collections
              </button>
            </div>
          </div>
        )}

        {/* Cart items */}
        {items.length > 0 && (
          <>
            <div className="mt-8 space-y-4">
              {items.map(({ product, quantity }) => (
                <div
                  key={product.id}
                  className="flex gap-4 rounded-2xl border border-border bg-background p-4 transition-all hover:border-foreground/10"
                >
                  {/* Image */}
                  {product.image_url && (
                    <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary">
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    </div>
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    {product.brand && (
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        {product.brand}
                      </p>
                    )}
                    <p className="mt-0.5 text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      {product.name}
                    </p>
                    {product.category && (
                      <span className="mt-1 inline-block rounded-full bg-secondary border border-border px-2 py-0.5 text-[10px] text-muted-foreground capitalize">
                        {product.category}
                      </span>
                    )}
                    {product.price != null && (
                      <p className="mt-2 text-base font-bold text-foreground">
                        ${(product.price * quantity).toFixed(2)}
                        {quantity > 1 && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            (${product.price.toFixed(2)} each)
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Quantity + Remove */}
                  <div className="flex flex-col items-end justify-between">
                    <button
                      onClick={() => removeItem(product.id)}
                      className="rounded-full p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>

                    <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-1">
                      <button
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        className="rounded-full p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-sm font-medium text-foreground">
                        {quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        className="rounded-full p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-8 rounded-2xl border border-border bg-secondary/30 p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
                <span className="text-2xl font-bold text-foreground">
                  ${total.toFixed(2)}
                </span>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  className="flex-1 rounded-full bg-foreground py-3.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity"
                >
                  Checkout
                </button>
                <button
                  onClick={clearCart}
                  className="rounded-full border border-border px-5 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                >
                  Clear cart
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
