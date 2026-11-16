import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderLookup } from "@/components/order/OrderLookup";
import { OrderTracking } from "@/components/order/OrderTracking";
import { PageBackground } from "@/components/site/PageBackground";
import { PageTitle } from "@/components/site/PageTitle";
import { Loading, Unavailable } from "@/components/site/Unavailable";
import { getOrder } from "@/lib/server-api";

// The address is a private link to one customer's order.
export const metadata: Metadata = {
  title: "Acompanhar pedido | Mr Japa",
  robots: { index: false, follow: false },
};

async function Content({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const order = await getOrder(code);
  if (order === "not-found") return <OrderLookup notFound />;
  if (!order) return <Unavailable what="o pedido" />;
  return <OrderTracking initial={order} />;
}

export default function Page({ params }: { params: Promise<{ code: string }> }) {
  return (
    <>
      <PageBackground scene="pedido" />
      <PageTitle title="Acompanhar pedido" kana="ご注文状況" compact />
      <Suspense fallback={<Loading what="o pedido" />}>
        <Content params={params} />
      </Suspense>
    </>
  );
}
