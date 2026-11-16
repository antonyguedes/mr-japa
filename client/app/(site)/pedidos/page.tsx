import type { Metadata } from "next";
import { OrderLookup } from "@/components/order/OrderLookup";
import { PageBackground } from "@/components/site/PageBackground";
import { PageTitle } from "@/components/site/PageTitle";

export const metadata: Metadata = {
  title: "Pedidos | Mr Japa",
  description: "Confira o status do seu pedido no Mr Japa.",
};

export default function Page() {
  return (
    <>
      <PageBackground scene="pedido" />
      <PageTitle title="Acompanhar pedido" kana="ご注文状況" compact>
        Digite o código do pedido para conferir o status.
      </PageTitle>
      <OrderLookup />
    </>
  );
}
