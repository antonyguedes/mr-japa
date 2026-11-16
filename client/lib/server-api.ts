import type { Menu, Order, Restaurant } from "./types";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8080";

/** Fetches fresh data for Server Components. Returns null when the API can't answer. */
async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export const getMenu = () => get<Menu>("/api/menu");
export const getRestaurant = () => get<Restaurant>("/api/restaurant");

/** "not-found" is a wrong code; null means the API couldn't answer. */
export async function getOrder(code: string): Promise<Order | "not-found" | null> {
  try {
    const res = await fetch(`${API_URL}/api/orders/${encodeURIComponent(code)}`, { cache: "no-store" });
    if (res.status === 404) return "not-found";
    return res.ok ? ((await res.json()) as Order) : null;
  } catch {
    return null;
  }
}
