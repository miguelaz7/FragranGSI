# fragranGSI — loja de perfumes (projeto IAIE, UMinho 2026/27)

## Objetivo
Loja online de perfumes integrada com dois ERPs:
- **SAP S/4HANA (OData v2)** = System of Record de produtos, preços, stock e clientes.
- **Moloni (API REST, OAuth2)** = clientes de faturação e faturas-recibo.

## Stack
- Next.js (App Router) + React + Tailwind CSS
- API Routes do Next.js = camada de integração (nenhuma credencial no browser)
- Autenticação com **Auth0** (clientes e role admin); a loja não guarda passwords
- BD local (Prisma + SQLite/PostgreSQL): utilizadores, carrinho, mapeamento cliente SAP ↔ Moloni, log de integração
- Credenciais só em `.env` (no `.gitignore`)

## Serviços SAP (base: https://s20.gb.ucc.cit.tum.de/sap/opu/odata/sap/)
| Serviço | Uso | Tipo |
|---|---|---|
| UI_PRODUCTLIST | Catálogo | leitura |
| SD_PRICING_CONDITIONRECORD_SRV | Preços (condição PR00); criar PR00 do produto novo — escrita por confirmar | leitura / escrita? |
| C_STOCKQUANTITYVALUEBYTYPE_CDS | Stock | leitura |
| MD_C_PRODUCT_MAINTAIN_SRV | Criar produto a partir do backoffice: C_ProductCopywithparams (copiar material modelo) → alterar rascunho → C_ProductPreparation → C_ProductActivation | escrita (draft) |
| MD_CUSTOMER_MASTER_SRV_01 | Criar cliente: POST C_BusinessPartner (rascunho) → C_BusinessPartnerPreparation → C_BusinessPartnerActivation | escrita (draft) |
| SD_F1814_SO_FS_SRV | Consulta de encomendas SAP no backoffice | leitura |
| API_CUSTOMER_RETURN_SRV | Devoluções — **não ativo (404)** | — |

### O que foi confirmado no sistema S20 (29/10/2026)
- Sistema partilhado por vários grupos (utilizadores LEARN-nnn): filtrar sempre pelos materiais do grupo.
- **Perfumes no SAP:** `PERF001-093` ("Âmbar Amadeirado") completo a 31/10: material em `HD00`, 50 un. em `TG00`, PR00 89,00 EUR (`DS00`/`WH`, tabela 304). Stock lançado na app Fiori **Manage Stock** → Add Storage Location → Initial Entry of Stock (o `MIGO` não tem "Other" neste sistema); pode demorar minutos a aparecer no OData. Preço criado na app **Manage Prices - Sales** (tabela 304, Release Status = Released).
- `UI_PRODUCTLIST` → entidade `ProductList` (chave `ID`; uma linha por produto × centro). Campos úteis: `Product`, `ProductDescription`, `Plant`, `ProductType`, `ProductGroup`, `BaseUnit`, `InventoryPrice`, `Currency`, `CreatedByUser`. `$count`/`$select` não são permitidos; `$filter`, `$top`, `$skip` funcionam.
- `C_STOCKQUANTITYVALUEBYTYPE_CDS` → `C_STOCKQUANTITYVALUEBYTYPE`. **Filtro `Plant` obrigatório.** Quantidade em `MatlWrhsStkQtyInMatlBaseUnit`; somar as linhas com `InventoryStockTypeName = 'Unrestricted-Use Stock'`.
- `SD_PRICING_CONDITIONRECORD_SRV` → `C_SlsPricingConditionRecordTP`. **Filtro rápido (~1,5 s):** `ConditionTable eq '304' and ConditionType eq 'PR00' and SalesOrganization eq 'DS00' and DistributionChannel eq 'WH' and Material eq '…'`. **Não usar `IsActiveEntity eq true` no filtro** (o pedido demora >2 min e dá timeout); filtrar `IsActiveEntity === true` no código, porque podem existir rascunhos. Preço em `ConditionRateValue` / `ConditionRateValueUnit`. Tabela 304 = Sales org./Distr. Chl/Product.
- `MD_CUSTOMER_MASTER_SRV_01`: function imports `C_BusinessPartnerPreparation` e `C_BusinessPartnerActivation` existem (POST).
- `SD_F1814_SO_FS_SRV` → `C_Salesorderfs` / `C_Salesorderitemfs`.
- `API_CUSTOMER_RETURN_SRV` → **404, não está ativo**.
- APIs standard de escrita `API_PRODUCT_SRV`, `API_MATERIAL_DOCUMENT_SRV`, `API_SLSPRICINGCONDITIONRECORD_SRV`, `API_BUSINESS_PARTNER` → **403 (sem permissão)**.
- `MD_C_PRODUCT_MAINTAIN_SRV` → acessível. Testado a 31/10: `C_ProductCopywithparams` (Product='OHMT1000', IsActiveEntity=true, DraftUUID=guid zero, Plant, Storagelocation…) cria rascunho; `PATCH` com `ProductForEdit` + `ProductDescription` funciona; `C_ProductPreparation` OK; **`C_ProductActivation` dá dump no servidor (HTTP 500 / RAISE_SHORTDUMP), em PT e EN, com e sem dados de vendas.** Nenhum material foi criado; rascunhos de teste apagados. Criação de produtos por API está bloqueada até se perceber a causa.
- **Stock não pode ser lançado por API** (sem acesso a movimentos de mercadoria): entrada de stock é sempre manual no SAP (`MIGO`, movimento 561).
- Estrutura organizacional usada (Global Bike): centro `HD00`, depósito `TG00`, org. vendas `DS00`, canal `WH`, moeda EUR. Material modelo para copiar: `OHMT1000` (HAWA). Códigos dos nossos materiais: `PERFnnn-093`.

- **Descrições são por idioma:** os pedidos têm de levar `sap-language=PT` (já incluído em `sap.ts`), senão a descrição vem vazia.
- Script de exploração: `node scripts/sap-query.mjs <SERVIÇO> <EntitySet> "<$filter>" [top] [campos]`.

Notas SAP: POST exige token CSRF (GET com `x-csrf-token: fetch`, reutilizar token + cookies). Usar `$filter`, `$top`, `$skip`, `$select`, `$format=json`.

## Moloni
- Token: grant password / refresh_token (renovar automaticamente)
- customers/insert, invoices/insert (fatura-recibo), PDF da fatura
- IDs necessários: company_id, document_set_id, tax_id, unit_id (em `.env`)

## Fluxos principais
1. Registo de cliente (na loja ou no backoffice): cria BP no SAP (draft → ativação) + cliente no Moloni; guarda mapeamento na BD. O cliente tem de aparecer no Moloni.
2. Catálogo/produto: SAP (produto + preço + stock) enriquecido com fotos e notas olfativas da BD local.
3. Criar produto no backoffice: formulário (nome, concentração, tamanho, preço, notas olfativas, foto) → material criado no SAP por cópia do modelo + preço PR00; dados de enriquecimento guardados na BD local. O produto tem de aparecer no SAP. O stock é lançado à mão no SAP (`MIGO`); o backoffice indica isso.
4. Carrinho e checkout: qualquer visitante adiciona ao carrinho (cookie httpOnly `carrinho` com o id do `Cart` na BD; `src/lib/cart.ts` + Server Actions em `src/app/(loja)/carrinho/actions.ts`). O login só é exigido em /checkout. Checkout: valida stock no SAP → fatura-recibo no Moloni → confirmação com PDF.
5. Cada chamada a SAP/Moloni é registada (hora, sistema, operação, referência, estado, duração, resposta); erros com "Tentar novamente".
6. Assistente IA: API Route que recomenda só perfumes em stock.

## Design (ver /mockups — ficheiros .dc.html são HTML com estilos inline; usar como referência visual, não copiar a estrutura)
- Loja: fundo #12110F, superfície #1C1A17, linhas #2E2A25, texto #EFE9DF, secundário #A39A8C, dourado #C9A96E
- Backoffice: fundo #F7F6F3, cartões #FFFFFF, linhas #E4E1DB, texto #1A1917, secundário #5F5B54; sucesso #1F7A4D, erro #B3261E
- Tipografia: Bodoni Moda (títulos), Manrope (texto)
- Ecrãs: Main, Catalogo, Produto, Assistente, Carrinho, Checkout, Confirmacao, Conta, AdminDashboard, AdminEncomendas, AdminIntegracao (+ AdminProdutos e AdminClientes, sem mockup)
- Backoffice em /admin, protegido por role admin (Auth0)

## Regras
- Nunca expor credenciais no frontend nem em logs.
- Tratar erros de cada integração e mostrar mensagens claras.
- Código explicável: o grupo tem de saber justificar cada parte na apresentação.

## Comandos
- `npm run dev` — servidor de desenvolvimento (http://localhost:3000)
- `npx prisma migrate dev --name <nome>` — aplicar alterações ao schema; depois `npx prisma generate`
- `npx prisma db seed` — enriquecimento local (família, notas, género…) dos perfumes que existem no SAP

## Notas técnicas
- Next.js 16 com `cacheComponents`: dados por pedido (BD, SAP, cookies) têm de ficar dentro de `<Suspense>`; `params`/`cookies()` são assíncronos; `middleware` chama-se `proxy`.
- Prisma 7: cliente gerado em `src/generated/prisma` (import de `@/generated/prisma/client`), SQLite via adapter better-sqlite3 (`src/lib/db.ts`).
- Catálogo: `getCatalog()` em `src/lib/catalog.ts` junta SAP (produtos com prefixo `SAP_PRODUCT_PREFIX` no centro `SAP_PLANT`, stock tipo `01`, PR00) + `ProductInfo` local. Usa `"use cache"` + `cacheLife("minutes")` + `cacheTag("catalogo")`; chamar depois de `await connection()` para não ir ao SAP no build. O stock tem de ser revalidado ao vivo no checkout.
- Sessão: `getCurrentUser()` em `src/lib/auth.ts` é o único ponto a ligar ao Auth0 (hoje devolve sempre null).
- Chamadas externas passam sempre por `withLog()` (`src/lib/integration/log.ts`) para ficarem no IntegrationLog.
