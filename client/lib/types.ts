export type Item = {
  id: string;
  name: string;
  name_ja: string;
  description: string;
  price_cents: number;
  available: boolean;
  image: string;
};

export type Category = { id: string; name: string; name_ja: string; items: Item[] };

export type Menu = { categories: Category[] };

export type Restaurant = {
  name: string;
  address: string;
  hours: string;
  phone: string;
  email: string;
  instagram: string;
  map_url: string;
  whatsapp_enabled: boolean;
  delivery_enabled: boolean;
  delivery_fee_cents: number;
};

export type OrderStatus = "new" | "accepted" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
export type Fulfillment = "pickup" | "delivery";
export type PaymentMethod = "pix" | "card" | "cash";

export type OrderItem = { name: string; quantity: number; unit_price_cents: number };

export type Order = {
  code: string;
  status: OrderStatus;
  channel: "site" | "whatsapp";
  fulfillment: Fulfillment;
  payment_method: PaymentMethod;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  created_at: string;
  items: OrderItem[];
};

export type AdminOrder = Order & {
  customer_name: string;
  customer_phone: string;
  address: string;
  notes: string;
};
