// Validação dos dados de um cliente, usada no backoffice e no registo da loja.

type CustomerFields = {
  name: string;
  email: string;
  nif: string | null;
  address: string;
  postalCode: string;
  city: string;
};

/** Aceita 4700000 e 4700-000, e o NIF com espaços, como as pessoas costumam escrever. */
export function normalizeCustomer<T extends { nif: string | null; postalCode: string }>(data: T): T {
  const { nif, postalCode } = data;
  return {
    ...data,
    nif: nif?.replace(/\s/g, "") || null,
    postalCode: /^\d{7}$/.test(postalCode) ? `${postalCode.slice(0, 4)}-${postalCode.slice(4)}` : postalCode,
  };
}

/** Regra do NIF português: 9 dígitos, o último é um dígito de controlo (módulo 11). */
function isValidNif(nif: string) {
  if (!/^[1-9]\d{8}$/.test(nif)) return false;
  const sum = [...nif.slice(0, 8)].reduce((acc, digit, i) => acc + Number(digit) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(nif[8]);
}

/** Os limites de tamanho são os dos campos do SAP. */
export function validateCustomer(data: CustomerFields) {
  const errors: Record<string, string> = {};
  if (data.name.split(/\s+/).length < 2 || data.name.length > 80) errors.name = "Indique o nome e o apelido (máx. 80 caracteres).";
  if (!/^\S+@\S+\.\S+$/.test(data.email)) errors.email = "Email inválido.";
  if (data.nif && !isValidNif(data.nif)) errors.nif = "NIF inválido.";
  if (!data.address || data.address.length > 60) errors.address = "Indique a morada (máx. 60 caracteres).";
  if (!/^\d{4}-\d{3}$/.test(data.postalCode)) errors.postalCode = "Use o formato 4700-000.";
  if (!data.city || data.city.length > 40) errors.city = "Indique a localidade (máx. 40 caracteres).";
  return errors;
}

/** O bcrypt só usa os primeiros 72 bytes, por isso não aceitamos passwords maiores. */
export function validatePassword(password: string) {
  if (password.length < 8) return "A palavra-passe tem de ter pelo menos 8 caracteres.";
  if (Buffer.byteLength(password) > 72) return "A palavra-passe é demasiado longa.";
  return null;
}
