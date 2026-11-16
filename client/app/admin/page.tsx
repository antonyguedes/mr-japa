import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin/AdminPanel";

export const metadata: Metadata = {
  title: "Painel | Mr Japa",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminPanel />;
}
