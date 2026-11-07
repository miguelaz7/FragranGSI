"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { changePassword, login, register, updateProfile, type AccountFormState } from "@/app/(loja)/conta/actions";
import { useKeptForm } from "@/lib/use-kept-form";

const inputClass =
  "h-12 w-full border border-loja-line bg-loja-bg px-3 text-[15px] placeholder:text-loja-muted/60 focus:border-ouro focus:outline-none aria-[invalid=true]:border-[#F2B8B5]";
const primaryButton = "h-13 w-full bg-ouro px-8 font-semibold text-loja-bg hover:opacity-90 disabled:opacity-60";
const secondaryButton = "h-12 border border-ouro px-6 text-sm font-semibold text-ouro hover:bg-ouro hover:text-loja-bg disabled:opacity-60";
const errorText = "text-sm leading-snug text-[#F2B8B5]";

type FieldProps = ComponentProps<"input"> & { name: string; label: string; hint?: string; state: AccountFormState };

function Field({ name, label, hint, state, ...rest }: FieldProps) {
  const error = state?.errors?.[name];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm">{label}</label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-erro` : hint ? `${name}-ajuda` : undefined}
        className={inputClass}
        {...rest}
      />
      {error ? (
        <span id={`${name}-erro`} className={errorText}>{error}</span>
      ) : (
        hint && <span id={`${name}-ajuda`} className="text-[13px] text-loja-muted">{hint}</span>
      )}
    </div>
  );
}

/** Sem campo de confirmação, poder ver o que se escreveu evita erros. */
function PasswordField({ name, label, hint, state, ...rest }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const error = state?.errors?.[name];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm">{label}</label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-erro` : hint ? `${name}-ajuda` : undefined}
          className={`${inputClass} pr-20`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
          className="absolute inset-y-0 right-0 px-3 text-[13px] text-loja-muted hover:text-ouro"
        >
          {visible ? "Esconder" : "Mostrar"}
        </button>
      </div>
      {error ? (
        <span id={`${name}-erro`} className={errorText}>{error}</span>
      ) : (
        hint && <span id={`${name}-ajuda`} className="text-[13px] text-loja-muted">{hint}</span>
      )}
    </div>
  );
}

function Message({ state }: { state: AccountFormState }) {
  // Com erros nos campos, a mensagem geral só repetia o que já está assinalado
  if (!state?.message || state.errors) return null;
  return <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-stock-ok" : errorText}>{state.message}</p>;
}

const twoColumns = "grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-start gap-4";

export function LoginForm({ voltar }: { voltar: string }) {
  const { state, action, pending, formRef, onSubmit } = useKeptForm(login);
  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="voltar" value={voltar} />
      <Field name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <PasswordField name="password" label="Palavra-passe" autoComplete="current-password" required state={state} />
      <Message state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "A entrar…" : "Entrar"}</button>
    </form>
  );
}

export function RegisterForm({ voltar }: { voltar: string }) {
  const { state, action, pending, formRef, onSubmit } = useKeptForm(register);
  const termsError = state?.errors?.terms;
  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="voltar" value={voltar} />
      <div className={twoColumns}>
        <Field name="firstName" label="Nome" autoComplete="given-name" maxLength={40} state={state} />
        <Field name="lastName" label="Apelido" autoComplete="family-name" maxLength={39} state={state} />
      </div>
      <Field name="email" label="Email" type="email" autoComplete="email" state={state} />
      <PasswordField name="password" label="Palavra-passe" hint="Pelo menos 8 caracteres." autoComplete="new-password" state={state} />
      <Field name="address" label="Morada" autoComplete="street-address" maxLength={60} state={state} />
      <div className={twoColumns}>
        <Field name="postalCode" label="Código postal" placeholder="4700-000" autoComplete="postal-code" inputMode="numeric" state={state} />
        <Field name="city" label="Localidade" autoComplete="address-level2" maxLength={40} state={state} />
      </div>
      <Field name="nif" label="NIF (opcional)" hint="Sem NIF, as faturas saem como consumidor final." inputMode="numeric" maxLength={11} state={state} />
      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2.5 text-sm leading-snug">
          <input
            type="checkbox"
            name="terms"
            aria-invalid={termsError ? true : undefined}
            aria-describedby={termsError ? "terms-erro" : undefined}
            className="mt-0.5 size-4 shrink-0 accent-ouro"
          />
          Aceito os termos e a política de privacidade.
        </label>
        {termsError && <span id="terms-erro" className={errorText}>{termsError}</span>}
      </div>
      <Message state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "A criar a sua conta…" : "Criar conta"}</button>
    </form>
  );
}

type Profile = { name: string; nif: string | null; address: string | null; postalCode: string | null; city: string | null };

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const { state, action, pending, formRef, onSubmit } = useKeptForm(updateProfile);
  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field name="name" label="Nome completo" autoComplete="name" maxLength={80} defaultValue={profile.name} state={state} />
      <Field name="email" label="Email" type="email" autoComplete="email" hint="É com este email que entra na loja." defaultValue={email} state={state} />
      <Field name="address" label="Morada" autoComplete="street-address" maxLength={60} defaultValue={profile.address ?? ""} state={state} />
      <div className={twoColumns}>
        <Field name="postalCode" label="Código postal" autoComplete="postal-code" inputMode="numeric" defaultValue={profile.postalCode ?? ""} state={state} />
        <Field name="city" label="Localidade" autoComplete="address-level2" maxLength={40} defaultValue={profile.city ?? ""} state={state} />
      </div>
      <Field name="nif" label="NIF (opcional)" hint="Sem NIF, as faturas saem como consumidor final." inputMode="numeric" maxLength={11} defaultValue={profile.nif ?? ""} state={state} />
      <Message state={state} />
      <div>
        <button type="submit" disabled={pending} className={secondaryButton}>{pending ? "A guardar…" : "Guardar alterações"}</button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const { state, action, pending, formRef, onSubmit } = useKeptForm(changePassword);

  // Depois de alterar, as passwords não devem continuar escritas no ecrã
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state, formRef]);

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-5">
      <PasswordField name="current" label="Palavra-passe atual" autoComplete="current-password" state={state} />
      <PasswordField name="password" label="Nova palavra-passe" hint="Pelo menos 8 caracteres." autoComplete="new-password" state={state} />
      <Message state={state} />
      <div>
        <button type="submit" disabled={pending} className={secondaryButton}>{pending ? "A alterar…" : "Alterar palavra-passe"}</button>
      </div>
    </form>
  );
}
