import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageBackground } from "@/components/site/PageBackground";
import { PageTitle } from "@/components/site/PageTitle";
import { Loading, Unavailable } from "@/components/site/Unavailable";
import styles from "@/components/site/info.module.css";
import { getRestaurant } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Contato | Mr Japa",
  description: "Fale com o Mr Japa.",
};

async function Content() {
  const restaurant = await getRestaurant();
  if (!restaurant) return <Unavailable what="os contatos" />;
  const { phone, email, instagram } = restaurant;
  const handle = instagram.replace(/^@/, "");

  return (
    <>
      {phone || email || handle ? (
        <dl className={styles.facts}>
          {phone && (
            <div>
              <dt>Telefone</dt>
              <dd>
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>
              </dd>
            </div>
          )}
          {email && (
            <div>
              <dt>E-mail</dt>
              <dd>
                <a href={`mailto:${email}`}>{email}</a>
              </dd>
            </div>
          )}
          {handle && (
            <div>
              <dt>Instagram</dt>
              <dd>
                <a href={`https://instagram.com/${encodeURIComponent(handle)}`} target="_blank" rel="noreferrer">
                  @{handle}
                </a>
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className={styles.soon}>Em breve publicaremos aqui os nossos canais de contato.</p>
      )}
      {restaurant.whatsapp_enabled && (
        <p className={styles.soon} style={{ marginTop: 24 }}>
          Para fazer um pedido pelo WhatsApp, monte o seu carrinho e escolha essa opção ao finalizar.
        </p>
      )}
      <Link className={styles.cta} href="/cardapio">
        FAZER PEDIDO
      </Link>
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageBackground scene="contato" />
      <PageTitle title="Contato" kana="お問い合わせ" />
      <div className={styles.wrap}>
        <Suspense fallback={<Loading what="os contatos" />}>
          <Content />
        </Suspense>
      </div>
    </>
  );
}
