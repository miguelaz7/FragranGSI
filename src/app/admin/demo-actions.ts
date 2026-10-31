"use server";

import { refresh } from "next/cache";
import { clearDemoData, generateDemoData } from "@/lib/demo-data";

// Botões "Gerar / Apagar dados de demonstração" do backoffice.
// TODO(Auth0): só para admin.

export async function createDemoData() {
  await generateDemoData();
  refresh();
}

export async function removeDemoData() {
  await clearDemoData();
  refresh();
}
