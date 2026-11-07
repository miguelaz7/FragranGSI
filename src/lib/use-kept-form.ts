"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

export type FormResult = { ok?: boolean; message: string; errors?: Record<string, string> } | null;

/**
 * Formulário com Server Action. Sem isto, o React limpa o formulário no fim de cada envio
 * e quem o preencheu perdia tudo quando havia um erro. Também leva o foco ao primeiro
 * campo com erro. Com JavaScript desligado, o "action" do form continua a funcionar.
 */
export function useKeptForm(serverAction: (state: FormResult, fd: FormData) => Promise<FormResult>) {
  const [state, action, pending] = useActionState<FormResult, FormData>(serverAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };

  useEffect(() => {
    if (state?.errors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return { state, action, pending, formRef, onSubmit };
}
