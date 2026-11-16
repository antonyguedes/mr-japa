import Link from "next/link";
import styles from "@/components/site/site.module.css";

export default function NotFound() {
  return (
    <main className={styles.notice}>
      <h2>Página não encontrada</h2>
      <p>
        <Link href="/" style={{ textDecoration: "underline" }}>
          Voltar para o início
        </Link>
      </p>
    </main>
  );
}
