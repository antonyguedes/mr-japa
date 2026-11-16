import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBackground } from "@/components/site/PageBackground";
import { PageTitle } from "@/components/site/PageTitle";
import { Loading, Unavailable } from "@/components/site/Unavailable";
import styles from "@/components/site/info.module.css";
import { getRestaurant } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Localização | Mr Japa",
  description: "Onde encontrar o Mr Japa e os horários de funcionamento.",
};

async function Content() {
  const restaurant = await getRestaurant();
  if (!restaurant) return <Unavailable what="a localização" />;
  const { address, hours, map_url: mapUrl } = restaurant;

  if (!address && !hours) {
    return <p className={styles.soon}>Em breve publicaremos aqui o nosso endereço e os horários de funcionamento.</p>;
  }
  return (
    <dl className={styles.facts}>
      {address && (
        <div>
          <dt>Endereço</dt>
          <dd>
            {address}
            {mapUrl && (
              <>
                <br />
                <a href={mapUrl} target="_blank" rel="noreferrer">
                  Abrir no mapa
                </a>
              </>
            )}
          </dd>
        </div>
      )}
      {hours && (
        <div>
          <dt>Horário de funcionamento</dt>
          <dd>{hours}</dd>
        </div>
      )}
    </dl>
  );
}

export default function Page() {
  return (
    <>
      <PageBackground scene="localizacao" />
      <PageTitle title="Localização" kana="アクセス" />
      <div className={styles.wrap}>
        <Suspense fallback={<Loading what="a localização" />}>
          <Content />
        </Suspense>
      </div>
    </>
  );
}
