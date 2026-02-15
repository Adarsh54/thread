"use client";

import Image from "next/image";
import { useState } from "react";
import { ShoppingBag, Check } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  selected?: boolean;
}

export function ProductCard({ product, onSelect, selected }: ProductCardProps) {
  const [loaded, setLoaded] = useState(false);
  const { addItem, items: cartItems } = useCart();
  const inCart = cartItems.some((ci) => ci.product.id === product.id);

  return (
    <div
      data-product-id={product.id}
      className={`group text-left w-full transition-all duration-200 ${
        selected ? "ring-2 ring-foreground rounded-xl" : ""
      }`}
    >
      {/* Image */}
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="relative aspect-[3/4] overflow-hidden rounded-xl bg-secondary w-full"
      >
        {product.image_url && (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={`object-cover transition-all duration-500 group-hover:scale-105 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setLoaded(true)}
          />
        )}
        {!loaded && (
          <div className="absolute inset-0 animate-pulse bg-secondary" />
        )}

        {/* Add to cart overlay button */}
        <div
          className={`absolute bottom-2 right-2 z-10 transition-all duration-200 ${
            inCart ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!inCart) addItem(product);
            }}
            disabled={inCart}
            className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md transition-all ${
              inCart
                ? "bg-green-500/90 text-white"
                : "bg-black/70 text-white hover:bg-black/90"
            }`}
          >
            {inCart ? <Check size={13} /> : <ShoppingBag size={13} />}
            {inCart ? "In cart" : "Add to cart"}
          </button>
        </div>
      </button>

      {/* Info */}
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="mt-3 px-0.5 text-left w-full"
      >
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {product.brand}
        </p>
        <h3 className="mt-0.5 text-sm font-medium text-foreground line-clamp-1">
          {product.name}
        </h3>
        {product.price != null && (
          <p className="mt-0.5 text-sm text-foreground">
            ${product.price.toFixed(2)}
          </p>
        )}
      </button>
    </div>
  );
}
