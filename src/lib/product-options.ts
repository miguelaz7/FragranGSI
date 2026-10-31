// Valores possíveis da ficha de produto, partilhados pelos filtros do
// catálogo e pelo formulário do backoffice.

export const GENDERS = [
  { value: "mulher", label: "Mulher" },
  { value: "homem", label: "Homem" },
  { value: "unissexo", label: "Unissexo" },
];

// Famílias principais (usadas nos filtros). A ficha pode ter variantes,
// ex.: "Oriental amadeirado" entra no filtro "Amadeirado" e no "Oriental".
export const FAMILIES = ["Amadeirado", "Floral", "Cítrico", "Oriental", "Verde"];

export const CONCENTRATIONS = ["Eau de Parfum", "Eau de Toilette", "Extrait"];
