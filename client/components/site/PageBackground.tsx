import Image from "next/image";
import styles from "./site.module.css";

type Scene = "cardapio" | "pedido" | "localizacao" | "contato";

// Menu and checkout are for reading and filling in, so they get a plain gradient.
const PHOTOS: Partial<Record<Scene, string>> = {
  localizacao: "/backgrounds/localizacao.jpg",
  contato: "/backgrounds/contato.jpg",
};

/** Full-page background. To replace a photo, swap its file in public/backgrounds/. */
export function PageBackground({ scene }: { scene: Scene }) {
  const photo = PHOTOS[scene];
  return (
    <div className={styles.background} data-scene={scene} aria-hidden="true">
      {photo && <Image src={photo} alt="" fill sizes="100vw" quality={90} preload />}
    </div>
  );
}
