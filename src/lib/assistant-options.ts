// Perguntas do assistente (iguais ao mockup). Partilhadas pela página e pela API.
export const QUESTIONS = [
  { key: "ocasiao", title: "1. Para que ocasião?", options: ["Dia a dia", "Trabalho", "Noite", "Ocasião especial"] },
  { key: "notas", title: "2. Que notas prefere?", options: ["Frescas", "Florais", "Doces", "Amadeiradas"] },
  { key: "intensidade", title: "3. Que intensidade?", options: ["Suave", "Moderada", "Intensa"] },
] as const;

export type QuestionKey = (typeof QUESTIONS)[number]["key"];
export type Answers = Partial<Record<QuestionKey, string>> & { texto?: string };

export const MAX_TEXT = 300; // caracteres do campo livre

export type Recommendation = {
  sapProduct: string;
  name: string;
  price: number;
  imageUrl: string | null;
  match: string; // ex.: "Melhor correspondência"
  why: string;
};

export type RecommendResult = {
  source: "ia" | "regras"; // "regras" = sem IA (sem chave ou o Gemini falhou)
  recs: Recommendation[];
};
