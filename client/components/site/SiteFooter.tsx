import Link from "next/link";
import { nav } from "@/content/hero";
import styles from "./site.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div>
        <p className={styles.footerName}>Mr Japa</p>
        <p className={styles.footerJa} lang="ja">
          一期一会
        </p>
      </div>
      <nav aria-label="Rodapé">
        {nav.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
