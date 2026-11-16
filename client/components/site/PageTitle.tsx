import Image from "next/image";
import styles from "./site.module.css";

type Props = {
  title: string;
  kana: string;
  /** Photo band behind the title, for pages without their own PageBackground. */
  image?: string;
  /** Smaller heading for task pages, where the content should come first. */
  compact?: boolean;
  children?: React.ReactNode;
};

export function PageTitle({ title, kana, image, compact = false, children }: Props) {
  return (
    <section className={styles.title} data-band={Boolean(image)} data-compact={compact}>
      {image && <Image className={styles.titleImage} src={image} alt="" fill sizes="100vw" quality={90} preload />}
      <div className={styles.titleInner}>
        <p className={styles.titleKana} lang="ja">
          {kana}
        </p>
        <h1>{title}</h1>
        {children && <div className={styles.titleLead}>{children}</div>}
      </div>
    </section>
  );
}
