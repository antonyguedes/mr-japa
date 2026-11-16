"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { setQuantity, useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import type { Item, Menu } from "@/lib/types";
import styles from "./menu.module.css";

// Below the sticky header and search, where a section counts as being read.
const READING_LINE = 200;
// The last section may be too short to reach that line, so the page's end selects it.
const FOOTER_ZONE = 260;

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

function Stepper({ item, quantity, small = false }: { item: Item; quantity: number; small?: boolean }) {
  return (
    <div className={styles.stepper} data-small={small} role="group" aria-label={`Quantidade de ${item.name}`}>
      <button type="button" aria-label={`Remover um ${item.name}`} onClick={() => setQuantity(item.id, quantity - 1)}>
        −
      </button>
      <output aria-live="polite">{quantity}</output>
      <button type="button" aria-label={`Adicionar um ${item.name}`} onClick={() => setQuantity(item.id, quantity + 1)}>
        +
      </button>
    </div>
  );
}

function ItemPhoto({ item, onZoom }: { item: Item; onZoom: () => void }) {
  const [failed, setFailed] = useState(false);
  if (!item.image || failed) {
    return (
      <div className={styles.photoEmpty} aria-hidden="true" lang="ja">
        {item.name_ja}
      </div>
    );
  }
  return (
    <button type="button" className={styles.photo} aria-label={`Ampliar foto de ${item.name}`} onClick={onZoom}>
      <Image src={item.image} alt="" fill sizes="(max-width: 560px) 84px, 104px" onError={() => setFailed(true)} />
    </button>
  );
}

function PhotoZoom({ item, onClose }: { item: Item; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.zoom}
      aria-label={`Foto de ${item.name}`}
      onClose={onClose}
      // The dialog has no padding, so a click on the element itself is on the backdrop.
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current.close();
      }}
    >
      <div className={styles.zoomBody}>
        <div className={styles.zoomImage}>
          <Image src={item.image} alt={item.name} fill sizes="min(92vw, 920px)" quality={90} />
        </div>
        <div className={styles.zoomCaption}>
          <div>
            <h2>{item.name}</h2>
            <p>{item.description}</p>
          </div>
          <span className={styles.price}>{brl(item.price_cents)}</span>
        </div>
        <button type="button" className={styles.zoomClose} aria-label="Fechar foto" autoFocus onClick={() => dialogRef.current?.close()}>
          ×
        </button>
      </div>
    </dialog>
  );
}

export function MenuBrowser({ menu }: { menu: Menu }) {
  const { lines } = useCart();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(menu.categories[0]?.id);
  const tabsRef = useRef<HTMLElement>(null);
  const [zoomed, setZoomed] = useState<Item | null>(null);
  const scrollLock = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categories = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return menu.categories;
    return menu.categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => normalize(`${item.name} ${item.description} ${category.name}`).includes(term)),
      }))
      .filter((category) => category.items.length > 0);
  }, [menu, query]);

  const inCart = menu.categories.flatMap((category) =>
    category.items.flatMap((item) => (lines[item.id] ? [{ item, quantity: lines[item.id] }] : [])),
  );
  const count = inCart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = inCart.reduce((sum, line) => sum + line.item.price_cents * line.quantity, 0);

  // Highlights the tab of the section being read.
  useEffect(() => {
    const update = () => {
      // Right after a tab click, the smooth scroll passes over other sections.
      if (scrollLock.current || categories.length === 0) return;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - FOOTER_ZONE;
      const reached = categories.filter((category) => {
        const section = document.getElementById(category.id);
        return section && section.getBoundingClientRect().top <= READING_LINE;
      });
      setActive((atEnd ? categories : reached).at(-1)?.id ?? categories[0].id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [categories]);

  // On phones the tabs overflow: keep the current one in view without moving the page.
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (strip && tab) strip.scrollLeft = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
  }, [active]);

  function goTo(event: React.MouseEvent, id: string) {
    event.preventDefault();
    if (scrollLock.current) clearTimeout(scrollLock.current);
    scrollLock.current = setTimeout(() => {
      scrollLock.current = null;
    }, 1000);
    setActive(id);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <div className={styles.layout} data-has-items={count > 0}>
      <div className={styles.main}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <span className={styles.srOnly}>Buscar no cardápio</span>
            <input
              type="search"
              placeholder="Buscar um prato ou ingrediente"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
            />
          </label>
          <nav ref={tabsRef} className={styles.tabs} aria-label="Categorias do cardápio">
            {categories.map((category) => (
              <a
                key={category.id}
                href={`#${category.id}`}
                aria-current={active === category.id ? "true" : undefined}
                onClick={(e) => goTo(e, category.id)}
              >
                {category.name}
              </a>
            ))}
          </nav>
        </div>

        {categories.length === 0 && (
          <div className={styles.none} role="status">
            <p>Nada encontrado para “{query.trim()}”.</p>
            <button type="button" onClick={() => setQuery("")}>
              Limpar busca
            </button>
          </div>
        )}

        {categories.map((category) => (
          <section key={category.id} id={category.id} className={styles.section}>
            <h2>{category.name}</h2>
            <ul>
              {category.items.map((item) => {
                const quantity = lines[item.id] ?? 0;
                return (
                  <li key={item.id} className={styles.item} data-available={item.available} data-selected={quantity > 0}>
                    <div className={styles.itemMain}>
                      <ItemPhoto item={item} onZoom={() => setZoomed(item)} />
                      <div className={styles.itemText}>
                        <h3>{item.name}</h3>
                        <p>{item.description}</p>
                      </div>
                    </div>
                    <div className={styles.itemBuy}>
                      <span className={styles.price}>{brl(item.price_cents)}</span>
                      {!item.available ? (
                        <span className={styles.off}>Indisponível</span>
                      ) : quantity > 0 ? (
                        <Stepper item={item} quantity={quantity} />
                      ) : (
                        <button
                          type="button"
                          className={styles.add}
                          aria-label={`Adicionar ${item.name}`}
                          onClick={() => setQuantity(item.id, 1)}
                        >
                          Adicionar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside className={styles.cart} aria-label="Seu pedido">
        <h2>Seu pedido</h2>
        {inCart.length === 0 ? (
          <p className={styles.cartEmpty}>Adicione um prato para começar.</p>
        ) : (
          <>
            <ul>
              {inCart.map(({ item, quantity }) => (
                <li key={item.id}>
                  <div className={styles.cartLine}>
                    <span>{item.name}</span>
                    <span className={styles.cartPrice}>{brl(item.price_cents * quantity)}</span>
                  </div>
                  <Stepper item={item} quantity={quantity} small />
                </li>
              ))}
            </ul>
            <p className={styles.cartTotal}>
              <span>Subtotal</span>
              <strong>{brl(subtotal)}</strong>
            </p>
            <Link href="/cardapio/finalizar" className={styles.checkout}>
              Finalizar pedido
            </Link>
          </>
        )}
      </aside>

      {zoomed && <PhotoZoom item={zoomed} onClose={() => setZoomed(null)} />}

      {count > 0 && (
        <Link href="/cardapio/finalizar" className={styles.bar}>
          <span className={styles.barCount}>{count}</span>
          <span className={styles.barLabel}>Ver pedido</span>
          <span className={styles.price}>{brl(subtotal)}</span>
        </Link>
      )}
    </div>
  );
}
