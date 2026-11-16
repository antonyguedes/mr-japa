import type { Fulfillment, OrderStatus, PaymentMethod } from "./types";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const brl = (cents: number) => currency.format(cents / 100);

export const paymentLabel: Record<PaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
};

export const fulfillmentLabel: Record<Fulfillment, string> = {
  pickup: "Retirada no restaurante",
  delivery: "Entrega",
};

export const statusLabel: Record<OrderStatus, string> = {
  new: "Enviado",
  accepted: "Aceito",
  preparing: "Preparando",
  ready: "Pronto para retirada",
  out_for_delivery: "Saiu para Entrega",
  completed: "Finalizado",
  cancelled: "Cancelado",
};
