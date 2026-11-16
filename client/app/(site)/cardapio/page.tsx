import type { Metadata } from "next";
import { Suspense } from "react";
import { MenuBrowser } from "@/components/menu/MenuBrowser";
import { PageBackground } from "@/components/site/PageBackground";
import { PageTitle } from "@/components/site/PageTitle";
import { Loading, Unavailable } from "@/components/site/Unavailable";
import { getMenu } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Cardápio | Mr Japa",
  description: "Conheça o cardápio do Mr Japa e monte o seu pedido.",
};

async function Menu() {
  const menu = await getMenu();
  return menu ? <MenuBrowser menu={menu} /> : <Unavailable what="o cardápio" />;
}

export default function Page() {
  return (
    <>
      <PageBackground scene="cardapio" />
      <PageTitle title="Cardápio" kana="お品書き" compact>
        Escolha os seus pratos e finalize quando quiser.
      </PageTitle>
      <Suspense fallback={<Loading what="o cardápio" />}>
        <Menu />
      </Suspense>
    </>
  );
}
