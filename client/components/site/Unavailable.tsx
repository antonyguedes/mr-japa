import styles from "./site.module.css";

export function Unavailable({ what }: { what: string }) {
  return (
    <div className={styles.notice} role="alert">
      <h2>Não foi possível carregar {what}</h2>
      <p>Nosso sistema não respondeu agora. Atualize a página em alguns instantes.</p>
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p className={styles.loading} role="status">
      Carregando {what}…
    </p>
  );
}
