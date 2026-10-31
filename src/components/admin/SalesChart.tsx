"use client";

import { useState } from "react";
import { formatEur } from "@/lib/format";

type Day = { label: string; value: number };

// Gráfico de barras das vendas diárias. O último dia é "Hoje" e fica destacado.
// Os valores aparecem ao passar o rato (ou com o teclado); o de hoje fica sempre visível.
export function SalesChart({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.value));

  if (max === 0) {
    return <p className="flex h-[220px] items-center justify-center text-sm text-admin-muted">Sem vendas nos últimos 7 dias.</p>;
  }

  const today = days.length - 1;

  return (
    <div>
      <div className="flex h-[220px] items-end gap-3.5 border-b border-admin-line" aria-hidden>
        {days.map((d, i) => {
          const showValue = i === active || (active === null && i === today);
          return (
            <div
              key={d.label}
              className="relative flex h-full flex-1 flex-col items-center justify-end gap-2"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <span className={`text-[11px] whitespace-nowrap text-admin-muted ${showValue ? "" : "invisible"}`}>
                {formatEur(d.value)}
              </span>
              <div
                className={`w-full max-w-11 rounded-t-[4px] ${i === today ? "bg-[#8A6A2F]" : "bg-[#C9B68E]"} ${i === active ? "opacity-80" : ""}`}
                style={{ height: `${Math.max((d.value / max) * 170, d.value > 0 ? 2 : 0)}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3.5" aria-hidden>
        {days.map((d) => (
          <span key={d.label} className="flex-1 text-center text-xs text-admin-muted">{d.label}</span>
        ))}
      </div>

      {/* Versão em tabela para leitores de ecrã */}
      <table className="sr-only">
        <caption>Vendas por dia</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.label}><th scope="row">{d.label}</th><td>{formatEur(d.value)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
