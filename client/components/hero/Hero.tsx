"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { intro, kana, nav, reveal } from "@/content/hero";
import { buildHeroTimeline } from "./timeline";
import styles from "./Hero.module.css";

function Arrow({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M1 23 23 1M1 1h22v22" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useLayoutEffect(() => {
    return buildHeroTimeline(root.current!);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <section ref={root} className={styles.hero}>
      <div className={styles.sticky} data-hero-stage>
        <div className={styles.backdrop}>
          <div className={`${styles.bg} ${styles.bgFront}`} data-bg-front>
            <Image src="/hero/torii-front.png" alt="" fill sizes="100vw" quality={90} preload />
            <div className={styles.floor} data-bg-floor>
              <Image src="/hero/torii-front.png" alt="" fill sizes="100vw" quality={90} loading="eager" />
            </div>
          </div>
          <div className={`${styles.bg} ${styles.bgSide}`} data-bg-side>
            <Image src="/hero/torii-side.png" alt="" fill sizes="100vw" quality={90} preload />
          </div>
        </div>

        <div className={styles.word} aria-hidden="true">
          {intro.word.split("").map((letter, i) => (
            <span key={i} className={letter === " " ? styles.wordGap : undefined} data-letter>
              {letter}
            </span>
          ))}
        </div>

        <div className={`${styles.hill} ${styles.hillLeft}`} data-hill>
          <Image src="/hero/hill-left.png" alt="" fill sizes="65vw" preload />
        </div>
        <div className={`${styles.hill} ${styles.hillRight}`} data-hill>
          <Image src="/hero/hill-right.png" alt="" fill sizes="75vw" preload />
        </div>

        <header className={styles.header} data-menu-open={menuOpen}>
          <Link className={styles.logo} href="/" aria-label="Mr Japa" data-logo>
            <Image src="/hero/logo.png" alt="" fill sizes="80px" preload />
          </Link>
          <nav className={styles.nav} aria-label="Principal">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} data-nav-link>
                <span className={styles.navLabel} data-label={item.label}>
                  <span>{item.label}</span>
                </span>
              </Link>
            ))}
          </nav>
          <button
            type="button"
            className={styles.burger}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            data-burger
          >
            <span />
            <span />
          </button>
        </header>

        <ul className={styles.kana} aria-hidden="true">
          {kana.map((char) => (
            <li key={char} data-kana>
              {char}
            </li>
          ))}
        </ul>

        <div className={styles.intro} data-intro>
          <div className={styles.introHeading}>
            <h1 data-intro-heading>
              {intro.heading.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
          </div>
          {/* Always mounted: the timeline only animates elements that exist when it is built. */}
          <div className={styles.introBody}>
            <p data-intro-body>
              {intro.body.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
          </div>
        </div>



        <div className={styles.reveal}>
          <h2 data-reveal-heading>
            {reveal.heading.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
          <p data-reveal-body>{reveal.body}</p>
          <Arrow className={styles.revealArrow} data-reveal-arrow />
        </div>

        <Link className={styles.order} href={reveal.cta.href} data-order>
          <span className={styles.orderLabel}>{reveal.cta.label}</span>
          <span className={styles.orderIcon}>
            <Arrow />
          </span>
        </Link>


        <div className={styles.menu} data-open={menuOpen} inert={!menuOpen}>
          <nav aria-label="Menu">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
