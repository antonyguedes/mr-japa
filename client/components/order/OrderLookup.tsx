"use client";

import { useRouter } from "next/navigation";
import styles from "./order.module.css";

export function OrderLookup({ notFound = false }: { notFound?: boolean }) {
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim().toUpperCase();
    if (code) router.push(`/pedidos/${encodeURIComponent(code)}`);
  }

  return (
    <form className={styles.lookup} onSubmit={submit}>
      {notFound && (
        <p className={styles.error} role="alert">
          Não encontramos esse pedido. Confira o código e tente novamente.
        </p>
      )}
      <label className={styles.field}>
        <span>Código do pedido</span>
        <input
          name="code"
          required
          placeholder="Ex.: 7KQ2M9XHTB"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={notFound}
        />
      </label>
      <button type="submit" className={styles.primary}>
        Ver status
      </button>
    </form>
  );
}
