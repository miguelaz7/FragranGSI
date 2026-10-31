import type { Metadata } from "next";
import { AssistantForm } from "@/components/loja/AssistantForm";

export const metadata: Metadata = { title: "Encontrar o meu perfume" };

export default function AssistentePage() {
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-12 py-14">
      <div className="flex flex-col gap-4">
        <span className="text-xs uppercase tracking-[0.24em] text-ouro">Assistente de fragrâncias</span>
        <h1 className="font-serif text-[clamp(40px,5vw,64px)] leading-[1.05]">Vamos encontrar o seu perfume.</h1>
        <p className="text-[17px] text-loja-muted">Três perguntas rápidas. As sugestões vêm só dos perfumes que temos em stock.</p>
      </div>
      <AssistantForm />
    </div>
  );
}
