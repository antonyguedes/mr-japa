import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/site/PageTitle";
import styles from "@/components/site/info.module.css";

export const metadata: Metadata = {
  title: "Sobre nós | Mr Japa",
  description: "A cozinha japonesa do Mr Japa: técnica, simplicidade e cuidado em cada prato.",
};

const pillars = [
  { title: "Técnica", text: "Do corte do peixe ao ponto do arroz, cada etapa segue o tempo que a cozinha japonesa pede." },
  { title: "Simplicidade", text: "Poucos elementos em cada prato, para que cada sabor apareça com clareza." },
  { title: "Cuidado", text: "Do preparo à entrega do pedido, tratamos cada refeição como um momento único." },
];

export default function Page() {
  return (
    <>
      <PageTitle title="Sobre nós" kana="私たちについて" image="/hero/torii-front.png" />
      <div className={styles.wrap}>
        <blockquote className={styles.quote}>
          <p>
            <span className={styles.quoteJa} lang="ja">
              一期一会
            </span>
            “Um encontro, uma oportunidade.” Essa expressão japonesa lembra que cada momento acontece uma única vez. É
            com esse espírito que recebemos você à nossa mesa.
          </p>
        </blockquote>
        <ul className={styles.pillars}>
          {pillars.map((pillar) => (
            <li key={pillar.title}>
              <h2>{pillar.title}</h2>
              <p>{pillar.text}</p>
            </li>
          ))}
        </ul>
        <Link className={styles.cta} href="/cardapio">
          VER CARDÁPIO
        </Link>
      </div>
    </>
  );
}
