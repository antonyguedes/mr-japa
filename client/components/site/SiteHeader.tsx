"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { nav } from "@/content/hero";
import { useCart } from "@/lib/cart";
import styles from "./site.module.css";

function NavLinks({ pathname, onNavigate }: { pathname?: string; onNavigate: () => void }) {
  return nav.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={pathname?.startsWith(item.href) ? "page" : undefined}
      onClick={onNavigate}
    >
      {item.label}
    </Link>
  ));
}

// The current path is runtime data on dynamic routes, so only this part waits for it.
function ActiveNavLinks({ onNavigate }: { onNavigate: () => void }) {
  return <NavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}

export function SiteHeader() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className={styles.header} data-open={open}>
      <Link className={styles.logo} href="/" aria-label="Mr Japa, página inicial">
        <Image src="/hero/logo.png" alt="" fill sizes="60px" />
      </Link>

      <nav className={styles.nav} id="site-nav" aria-label="Principal">
        <Suspense fallback={<NavLinks onNavigate={close} />}>
          <ActiveNavLinks onNavigate={close} />
        </Suspense>
      </nav>

      <Link className={styles.cart} href="/cardapio/finalizar" aria-label={`Carrinho, ${count} ${count === 1 ? "item" : "itens"}`}>
        <span>CARRINHO</span>
        <span className={styles.cartCount} data-filled={count > 0}>
          {count}
        </span>
      </Link>

      <button
        type="button"
        className={styles.burger}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
      </button>
    </header>
  );
}
