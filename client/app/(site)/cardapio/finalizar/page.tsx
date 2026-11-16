import type { Metadata } from "next";
import { Suspense } from "react";
import { Checkout } from "@/components/order/Checkout";
import { PageBackground } from "@/components/site/PageBackground";
import { PageTitle } from "@/components/site/PageTitle";
import { Loading, Unavailable } from "@/components/site/Unavailable";
import { getMenu, getRestaurant } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Finalizar pedido | Mr Japa",
  description: "Revise o seu carrinho e finalize o pedido.",
};

async function Content() {
  const [menu, restaurant] = await Promise.all([getMenu(), getRestaurant()]);
  if (!menu || !restaurant) return <Unavailable what="o pedido" />;
  return <Checkout menu={menu} restaurant={restaurant} />;
}

export default function Page() {
  return (
    <>
      <PageBackground scene="cardapio" />
      <PageTitle title="Finalizar pedido" kana="ご注文" compact />
      <Suspense fallback={<Loading what="o pedido" />}>
        <Content />
      </Suspense>
    </>
  );
}
