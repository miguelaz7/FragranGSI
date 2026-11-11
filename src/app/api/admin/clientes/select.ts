import type { Prisma } from "@/generated/prisma/client";

// Campos de um cliente devolvidos pela API. Nunca inclui o passwordHash nem as sessões.
export const customerSelect = {
  id: true,
  email: true,
  name: true,
  nif: true,
  address: true,
  postalCode: true,
  city: true,
  role: true,
  sapBusinessPartner: true,
  sapDraftUuid: true,
  moloniCustomerId: true,
  isDemo: true,
  createdAt: true,
  passwordHash: true, // só para saber se tem acesso à loja (não sai na resposta)
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof customerSelect }>;

export function toCustomerJson({ passwordHash, _count, ...user }: Row) {
  return { ...user, hasPassword: passwordHash !== "", orders: _count.orders };
}
