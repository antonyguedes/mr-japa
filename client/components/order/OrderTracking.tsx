"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { brl, fulfillmentLabel, paymentLabel, statusLabel } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import styles from "./order.module.css";

const POLL_MS = 15_000;

const headline: Record<OrderStatus, string> = {
  new: "O seu pedido foi enviado ao restaurante",
  accepted: "O restaurante aceitou o seu pedido",
  preparing: "Estamos preparando o seu pedido",
  ready: "O seu pedido está pronto",
  out_for_delivery: "O seu pedido saiu para entrega",
  completed: "Pedido finalizado. Obrigado!",
  cancelled: "Este pedido foi cancelado",
};

function stepsFor(order: Order): OrderStatus[] {
  return order.fulfillment === "delivery"
    ? ["new", "accepted", "preparing", "out_for_delivery", "completed"]
    : ["new", "accepted", "preparing", "ready", "completed"];
}

export function OrderTracking({ initial }: { initial: Order }) {
  const [order, setOrder] = useState(initial);
  const [copied, setCopied] = useState(false);
  const finished = order.status === "completed" || order.status === "cancelled";

  useEffect(() => {
    if (finished) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${order.code}`, { cache: "no-store" });
        if (res.ok) setOrder((await res.json()) as Order);
      } catch {
        // A failed poll just waits for the next one.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [order.code, finished]);

  const steps = stepsFor(order);
  // "ready" is an optional stop for deliveries, so it counts as still preparing there.
  const position = order.status === "ready" && order.fulfillment === "delivery" ? 2 : steps.indexOf(order.status);

  return (
    <div className={styles.tracking}>
      <div>
        <h2 className={styles.headline} aria-live="polite">
          {headline[order.status]}
        </h2>
        <p className={styles.code}>
          Pedido <strong>{order.code}</strong>
        </p>
        {!finished && <p className={styles.hint}>Esta página atualiza sozinha. Guarde o link para acompanhar depois.</p>}
        {!finished && (
          <button
            type="button"
            className={styles.copy}
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true));
            }}
          >
            {copied ? "Link copiado" : "Copiar link"}
          </button>
        )}

        {order.status === "cancelled" ? (
          <p className={styles.cancelled} role="status">
            Em caso de dúvida, <Link href="/contato">fale com o restaurante</Link>.
          </p>
        ) : (
          <ol className={styles.steps}>
            {steps.map((step, i) => (
              <li key={step} data-state={i < position ? "done" : i === position ? "current" : "todo"} aria-current={i === position ? "step" : undefined}>
                {statusLabel[step]}
              </li>
            ))}
          </ol>
        )}
        <Link className={styles.other} href="/pedidos">
          Consultar outro pedido
        </Link>
      </div>

      <aside className={styles.panel} aria-label="Detalhes do pedido">
        <h2>Detalhes</h2>
        <ul>
          {order.items.map((item) => (
            <li key={item.name}>
              <div className={styles.lineName}>
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span className={styles.lineTotal}>{brl(item.unit_price_cents * item.quantity)}</span>
              </div>
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <div>
            <dt>Recebimento</dt>
            <dd>{fulfillmentLabel[order.fulfillment]}</dd>
          </div>
          <div>
            <dt>Pagamento</dt>
            <dd>{paymentLabel[order.payment_method]}</dd>
          </div>
          {order.fulfillment === "delivery" && (
            <div>
              <dt>Taxa de entrega</dt>
              <dd>{order.delivery_fee_cents > 0 ? brl(order.delivery_fee_cents) : "A combinar"}</dd>
            </div>
          )}
          <div className={styles.grand}>
            <dt>Total</dt>
            <dd>{brl(order.total_cents)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
