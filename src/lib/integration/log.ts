import "server-only";
import { db } from "@/lib/db";

export type System = "SAP" | "Moloni";

// Erro com uma mensagem pensada para mostrar ao utilizador/admin.
export class IntegrationError extends Error {
  constructor(
    public system: System,
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

type LogContext = {
  system: System;
  operation: string;
  reference?: string;
  // Se preenchido, o backoffice mostra "Tentar novamente" em caso de erro
  retry?: { action: string; payload: unknown };
};

const MAX_BODY = 4000;

// Remove campos sensíveis antes de guardar uma resposta no log.
const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie/i;

function sanitize(value: unknown): string {
  const text = JSON.stringify(
    value,
    (key, v) => (key && SECRET_KEYS.test(key) ? "***" : v),
    2,
  );
  if (!text) return "";
  return text.length > MAX_BODY ? text.slice(0, MAX_BODY) + "\n… (truncado)" : text;
}

/**
 * Executa uma chamada a um sistema externo e regista-a no IntegrationLog
 * (hora, sistema, operação, referência, estado, duração e resposta).
 * O erro é relançado para quem chamou decidir o que mostrar.
 */
export async function withLog<T>(ctx: LogContext, call: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await call();
    await db.integrationLog.create({
      data: {
        system: ctx.system,
        operation: ctx.operation,
        reference: ctx.reference,
        status: "OK",
        durationMs: Date.now() - start,
        response: sanitize(result),
      },
    });
    return result;
  } catch (err) {
    const e = err instanceof IntegrationError ? err : null;
    await db.integrationLog.create({
      data: {
        system: ctx.system,
        operation: ctx.operation,
        reference: ctx.reference,
        status: "Erro",
        durationMs: Date.now() - start,
        response: e?.body ? e.body.slice(0, MAX_BODY) : null,
        message: err instanceof Error ? err.message : String(err),
        retryAction: ctx.retry?.action,
        retryPayload: ctx.retry ? sanitize(ctx.retry.payload) : null,
      },
    });
    throw err;
  }
}
