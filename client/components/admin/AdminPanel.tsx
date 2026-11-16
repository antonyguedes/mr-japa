"use client";

import { useCallback, useEffect, useState } from "react";
import { brl, fulfillmentLabel, paymentLabel, statusLabel } from "@/lib/format";
import type { AdminOrder, Item, Menu, OrderStatus } from "@/lib/types";
import styles from "./admin.module.css";

const TOKEN_KEY = "mrjapa:admin";
const POLL_MS = 10_000;

/** Called when the server rejects the access code. */
class Unauthorized extends Error {}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Não foi possível concluir a operação.");
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

function nextSteps(order: AdminOrder): { status: OrderStatus; label: string }[] {
  const delivery = order.fulfillment === "delivery";
  switch (order.status) {
    case "new":
      return [{ status: "accepted", label: "Aceitar pedido" }];
    case "accepted":
      return [{ status: "preparing", label: "Iniciar preparo" }];
    case "preparing":
      return [delivery ? { status: "out_for_delivery", label: "Saiu para entrega" } : { status: "ready", label: "Pronto para retirada" }];
    case "ready":
      return [delivery ? { status: "out_for_delivery", label: "Saiu para entrega" } : { status: "completed", label: "Retirado" }];
    case "out_for_delivery":
      return [{ status: "completed", label: "Entregue" }];
    default:
      return [];
  }
}

export function AdminPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"orders" | "menu">("orders");

  useEffect(() => {
    // sessionStorage only exists in the browser, so this has to wait for the mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(sessionStorage.getItem(TOKEN_KEY));
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  if (!ready) return null;
  if (!token) {
    return (
      <Login
        onLogin={(value) => {
          sessionStorage.setItem(TOKEN_KEY, value);
          setToken(value);
        }}
      />
    );
  }

  return (
    <main className={styles.panel}>
      <header className={styles.top}>
        <h1>Painel Mr Japa</h1>
        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")}>
            Pedidos
          </button>
          <button type="button" role="tab" aria-selected={tab === "menu"} onClick={() => setTab("menu")}>
            Cardápio
          </button>
        </div>
        <button type="button" className={styles.logout} onClick={logout}>
          Sair
        </button>
      </header>
      {tab === "orders" ? <Orders token={token} onDenied={logout} /> : <MenuEditor token={token} onDenied={logout} />}
    </main>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("token") ?? "").trim();
    setPending(true);
    setError("");
    try {
      await request(value, "/api/admin/orders");
      onLogin(value);
    } catch (err) {
      setError(err instanceof Unauthorized ? "Código de acesso inválido." : (err as Error).message);
      setPending(false);
    }
  }

  return (
    <main className={styles.login}>
      <form onSubmit={submit}>
        <h1>Painel Mr Japa</h1>
        <label>
          <span>Código de acesso</span>
          <input name="token" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? "ENTRANDO…" : "ENTRAR"}
        </button>
      </form>
    </main>
  );
}

function Orders({ token, onDenied }: { token: string; onDenied: () => void }) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await request<AdminOrder[]>(token, "/api/admin/orders"));
      setError("");
    } catch (err) {
      if (err instanceof Unauthorized) onDenied();
      else setError("Sem conexão com o servidor. Tentando novamente…");
    }
  }, [token, onDenied]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  async function move(code: string, status: OrderStatus) {
    try {
      await request(token, `/api/admin/orders/${code}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      if (err instanceof Unauthorized) onDenied();
      else setError((err as Error).message);
    }
  }

  if (!orders) return <p className={styles.muted}>{error || "Carregando pedidos…"}</p>;

  const isOpen = (o: AdminOrder) => o.status !== "completed" && o.status !== "cancelled";
  const visible = orders.filter((o) => showClosed || isOpen(o));

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <label className={styles.filter}>
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        Mostrar concluídos e cancelados
      </label>
      {visible.length === 0 && <p className={styles.muted}>Nenhum pedido em aberto.</p>}
      <ul className={styles.orders}>
        {visible.map((order) => (
          <li key={order.code} className={styles.order} data-status={order.status}>
            <header>
              <strong>{order.code}</strong>
              <span className={styles.badge}>{statusLabel[order.status]}</span>
              <time dateTime={order.created_at}>
                {new Date(order.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </time>
            </header>
            <ul className={styles.lines}>
              {order.items.map((item) => (
                <li key={item.name}>
                  {item.quantity}x {item.name}
                </li>
              ))}
            </ul>
            <dl>
              <div>
                <dt>Cliente</dt>
                <dd>
                  {order.customer_name} · <a href={`tel:${order.customer_phone}`}>{order.customer_phone}</a>
                </dd>
              </div>
              <div>
                <dt>Recebimento</dt>
                <dd>{order.fulfillment === "delivery" ? `Entrega: ${order.address}` : fulfillmentLabel.pickup}</dd>
              </div>
              <div>
                <dt>Pagamento</dt>
                <dd>
                  {paymentLabel[order.payment_method]} · {brl(order.total_cents)}
                  {order.fulfillment === "delivery" && order.delivery_fee_cents === 0 ? " + taxa a combinar" : ""}
                </dd>
              </div>
              <div>
                <dt>Canal</dt>
                <dd>{order.channel === "whatsapp" ? "WhatsApp" : "Site"}</dd>
              </div>
              {order.notes && (
                <div>
                  <dt>Observações</dt>
                  <dd>{order.notes}</dd>
                </div>
              )}
            </dl>
            {isOpen(order) && (
              <div className={styles.actions}>
                {nextSteps(order).map((step) => (
                  <button key={step.status} type="button" className={styles.advance} onClick={() => void move(order.code, step.status)}>
                    {step.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => {
                    if (window.confirm(`Cancelar o pedido ${order.code}?`)) void move(order.code, "cancelled");
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function MenuEditor({ token, onDenied }: { token: string; onDenied: () => void }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/menu", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setMenu((await res.json()) as Menu);
    else setError("Não foi possível carregar o cardápio.");
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function update(item: Item, change: { price_cents?: number; available?: boolean; image?: string }) {
    setError("");
    // Shown right away; the reload below restores the saved value if the server refuses it.
    setMenu(
      (current) =>
        current && {
          ...current,
          categories: current.categories.map((category) => ({
            ...category,
            items: category.items.map((it) => (it.id === item.id ? { ...it, ...change } : it)),
          })),
        },
    );
    try {
      await request(token, `/api/admin/items/${item.id}`, { method: "PATCH", body: JSON.stringify(change) });
    } catch (err) {
      if (err instanceof Unauthorized) return onDenied();
      setError((err as Error).message);
    }
    await load();
  }

  if (!menu) return <p className={error ? styles.error : styles.muted}>{error || "Carregando cardápio…"}</p>;

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {menu.categories.map((category) => (
        <section key={category.id} className={styles.category}>
          <h2>{category.name}</h2>
          <ul>
            {category.items.map((item) => (
              <li key={item.id}>
                <span className={styles.itemName}>{item.name}</span>
                <label className={styles.priceField}>
                  <span>R$</span>
                  {/* Remounted by key so a rejected value goes back to the saved price. */}
                  <input
                    key={item.price_cents}
                    aria-label={`Preço de ${item.name}`}
                    inputMode="decimal"
                    defaultValue={(item.price_cents / 100).toFixed(2).replace(".", ",")}
                    onBlur={(e) => {
                      const cents = Math.round(Number(e.target.value.replace(",", ".")) * 100);
                      if (cents !== item.price_cents) void update(item, { price_cents: Number.isFinite(cents) ? cents : -1 });
                    }}
                  />
                </label>
                <label className={styles.imageField}>
                  <span>Foto</span>
                  <input
                    key={item.image}
                    aria-label={`Foto de ${item.name}`}
                    placeholder="/menu/nome-do-prato.jpg"
                    defaultValue={item.image}
                    onBlur={(e) => {
                      const image = e.target.value.trim();
                      if (image !== item.image) void update(item, { image });
                    }}
                  />
                </label>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={item.available} onChange={(e) => void update(item, { available: e.target.checked })} />
                  Disponível
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
