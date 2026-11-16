"use client";

import { useSyncExternalStore } from "react";

/** Cart lines by item ID. Only quantities are kept: prices always come from the API. */
export type CartLines = Record<string, number>;

const KEY = "mrjapa:cart";
const MAX_QUANTITY = 50;
const EMPTY: CartLines = {};

let lines: CartLines | null = null;
const listeners = new Set<() => void>();

function read(): CartLines {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return EMPTY;
    const valid = Object.entries(parsed).filter(
      ([, quantity]) => Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_QUANTITY,
    );
    return Object.fromEntries(valid);
  } catch {
    return EMPTY;
  }
}

function write(next: CartLines) {
  lines = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: the cart still works until the tab closes.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      lines = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  lines ??= read();
  return lines;
}

export function setQuantity(id: string, quantity: number) {
  const next = { ...getSnapshot() };
  if (quantity > 0) next[id] = Math.min(quantity, MAX_QUANTITY);
  else delete next[id];
  write(next);
}

export const clearCart = () => write({});

export function useCart() {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const count = Object.values(current).reduce((sum, quantity) => sum + quantity, 0);
  return { lines: current, count };
}
