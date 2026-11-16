"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearCart, setQuantity, useCart } from "@/lib/cart";
import { brl, paymentLabel } from "@/lib/format";
import type { Fulfillment, Item, Menu, Order, PaymentMethod, Restaurant } from "@/lib/types";
import styles from "./order.module.css";

type Channel = "site" | "whatsapp";
type Errors = Record<string, string>;

const PAYMENTS: PaymentMethod[] = ["pix", "card", "cash"];
// Form input names and the fields the API reports errors on.
const API_FIELD: Record<string, string> = { name: "customer_name", phone: "customer_phone", address: "address", notes: "notes" };

function formatPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d && `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  const split = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, split)}-${d.slice(split)}`;
}

export function Checkout({ menu, restaurant }: { menu: Menu; restaurant: Restaurant }) {
  const router = useRouter();
  const { lines, count } = useCart();
  const formRef = useRef<HTMLFormElement>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Channel | null>(null);

  // Takes the customer straight to the first thing to fix.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const catalog = new Map<string, Item>(menu.categories.flatMap((c) => c.items.map((it) => [it.id, it])));
  const entries = Object.entries(lines);
  const orderable = entries.flatMap(([id, quantity]) => {
    const item = catalog.get(id);
    return item?.available ? [{ item, quantity }] : [];
  });
  const blocked = entries.filter(([id]) => !catalog.get(id)?.available).map(([id]) => id);
  const subtotal = orderable.reduce((sum, { item, quantity }) => sum + item.price_cents * quantity, 0);
  const delivery = fulfillment === "delivery";
  const fee = delivery ? restaurant.delivery_fee_cents : 0;

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>O seu carrinho está vazio</h2>
        <p>Escolha os seus pratos no cardápio para continuar.</p>
        <Link className={styles.primary} href="/cardapio">
          Ver cardápio
        </Link>
      </div>
    );
  }

  async function submit(channel: Channel) {
    if (pending) return;
    const data = new FormData(formRef.current!);
    setPending(channel);
    setMessage("");
    setErrors({});
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: data.get("name"),
          customer_phone: data.get("phone"),
          fulfillment,
          address: data.get("address") ?? "",
          payment_method: data.get("payment"),
          notes: data.get("notes"),
          channel,
          items: Object.entries(lines).map(([item_id, quantity]) => ({ item_id, quantity })),
        }),
      });
      const body = (await res.json()) as {
        order?: Order;
        whatsapp_url?: string;
        error?: string;
        fields?: Errors;
      };
      if (!res.ok || !body.order) {
        setErrors(body.fields ?? {});
        setMessage(body.error ?? "Não foi possível enviar o pedido.");
        // Availability or prices may have changed: bring the latest menu.
        if (res.status === 409) router.refresh();
        setPending(null);
        return;
      }
      clearCart();
      if (body.whatsapp_url) window.location.assign(body.whatsapp_url);
      else router.push(`/pedidos/${body.order.code}`);
    } catch {
      setMessage("Sem conexão com o restaurante. Verifique a internet e tente novamente.");
      setPending(null);
    }
  }

  function clearError(e: React.ChangeEvent<HTMLFormElement>) {
    const field = API_FIELD[e.target.name];
    if (field && errors[field]) {
      setMessage("");
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.checkout}
      onChange={clearError}
      onSubmit={(e) => {
        e.preventDefault();
        void submit("site");
      }}
      noValidate
    >
      <div className={styles.fields}>
        <Link className={styles.back} href="/cardapio">
          ← Voltar ao cardápio
        </Link>

        <fieldset>
          <legend>
            <span className={styles.step}>1</span> Seus dados
          </legend>
          <Field label="Nome" name="name" autoComplete="name" error={errors.customer_name} />
          <Field
            label="WhatsApp com DDD"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="(11) 90000-0000"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            error={errors.customer_phone}
          />
        </fieldset>

        <fieldset>
          <legend>
            <span className={styles.step}>2</span> Como você quer receber?
          </legend>
          <div className={styles.choices}>
            <Choice name="fulfillment" checked={!delivery} onChange={() => setFulfillment("pickup")} label="Retirada" hint="No restaurante" />
            {restaurant.delivery_enabled && (
              <Choice
                name="fulfillment"
                checked={delivery}
                onChange={() => setFulfillment("delivery")}
                label="Entrega"
                hint={restaurant.delivery_fee_cents > 0 ? `Taxa de ${brl(restaurant.delivery_fee_cents)}` : "Taxa a combinar"}
              />
            )}
          </div>
          {errors.fulfillment && <p className={styles.error}>{errors.fulfillment}</p>}
          {delivery && (
            <Field label="Endereço de entrega" name="address" autoComplete="street-address" placeholder="Rua, número, complemento e bairro" error={errors.address} />
          )}
        </fieldset>

        <fieldset>
          <legend>
            <span className={styles.step}>3</span> Como você vai pagar?
          </legend>
          <p className={styles.hint}>O pagamento é feito ao receber o pedido.</p>
          <div className={styles.choices}>
            {PAYMENTS.map((method, i) => (
              <Choice key={method} name="payment" value={method} defaultChecked={i === 0} label={paymentLabel[method]} />
            ))}
          </div>
          {errors.payment_method && <p className={styles.error}>{errors.payment_method}</p>}
        </fieldset>

        <fieldset>
          <legend>
            <span className={styles.step}>4</span> Observações <small>(opcional)</small>
          </legend>
          <label className={styles.field}>
            <span>Alguma alergia ou pedido especial?</span>
            <textarea name="notes" rows={3} maxLength={300} aria-invalid={Boolean(errors.notes)} />
          </label>
          {errors.notes && <p className={styles.error}>{errors.notes}</p>}
        </fieldset>
      </div>

      <aside className={styles.side} aria-label="Resumo do pedido">
        <section className={styles.review}>
          <h2>
            Seu pedido <small>{count} {count === 1 ? "item" : "itens"}</small>
          </h2>
          <ul>
            {orderable.map(({ item, quantity }) => (
              <li key={item.id}>
                <div className={styles.lineName}>
                  <span>{item.name}</span>
                  <span className={styles.lineTotal}>{brl(item.price_cents * quantity)}</span>
                </div>
                <div className={styles.stepper} role="group" aria-label={`Quantidade de ${item.name}`}>
                  <button type="button" aria-label={`Remover um ${item.name}`} onClick={() => setQuantity(item.id, quantity - 1)}>
                    −
                  </button>
                  <output aria-live="polite">{quantity}</output>
                  <button type="button" aria-label={`Adicionar um ${item.name}`} onClick={() => setQuantity(item.id, quantity + 1)}>
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {blocked.length > 0 && (
            <div className={styles.blocked} role="alert">
              <p>
                {blocked.length === 1 ? "Um item do carrinho não está mais disponível." : `${blocked.length} itens do carrinho não estão mais disponíveis.`}
              </p>
              <button type="button" onClick={() => blocked.forEach((id) => setQuantity(id, 0))}>
                Remover do carrinho
              </button>
            </div>
          )}
        </section>

        <section className={styles.confirm}>
          <dl className={styles.totals}>
            {delivery && (
              <>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{brl(subtotal)}</dd>
                </div>
                <div>
                  <dt>Entrega</dt>
                  <dd>{fee > 0 ? brl(fee) : "A combinar"}</dd>
                </div>
              </>
            )}
            <div className={styles.grand}>
              <dt>Total</dt>
              <dd>{brl(subtotal + fee)}</dd>
            </div>
          </dl>

          {message && (
            <p className={styles.error} role="alert">
              {message}
            </p>
          )}

          <button type="submit" className={styles.primary} disabled={pending !== null || blocked.length > 0}>
            {pending === "site" ? "Enviando…" : "Confirmar pedido"}
          </button>
          {restaurant.whatsapp_enabled && (
            <>
              <p className={styles.or}>ou</p>
              <button
                type="button"
                className={styles.secondary}
                disabled={pending !== null || blocked.length > 0}
                onClick={() => void submit("whatsapp")}
              >
                {pending === "whatsapp" ? "Abrindo…" : "Enviar pelo WhatsApp"}
              </button>
            </>
          )}
        </section>
      </aside>
    </form>
  );
}

function Field({ label, error, ...input }: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input {...input} aria-invalid={Boolean(error)} />
      {error && <em className={styles.error}>{error}</em>}
    </label>
  );
}

function Choice({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={styles.choice}>
      <input type="radio" {...input} />
      <span>
        <i aria-hidden="true" />
        <span>
          {label}
          {hint && <small>{hint}</small>}
        </span>
      </span>
    </label>
  );
}
