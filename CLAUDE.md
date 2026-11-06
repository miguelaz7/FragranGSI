# fragranGSI — loja de perfumes (projeto IAIE, UMinho 2026/27)

## Objetivo
Loja online de perfumes integrada com dois ERPs:
- **SAP S/4HANA (OData v2)** = System of Record de produtos, preços e clientes; as entradas de stock são feitas aqui.
- **Moloni (API REST, OAuth2)** = clientes de faturação, faturas-recibo e **stock de venda** (decisão de 06/11: não há acesso a movimentos de mercadoria no SAP, por isso uma venda só consegue descontar stock no Moloni).

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
| MD_C_PRODUCT_MAINTAIN_SRV | Criar produto: C_ProductCopywithparams (copiar material modelo) → alterar rascunho → `$batch` com C_ProductPreparation + C_ProductActivation | escrita (draft) |
| MD_CUSTOMER_MASTER_SRV_01 | Criar cliente em rascunho: C_BusinessPartnerCustomerCreate → PATCH nome, morada e funções → C_BusinessPartnerCustomerPreparation. **Ativação: `$batch` com Preparation + Activation** | escrita (draft) |
| SD_F1814_SO_FS_SRV | Consulta de encomendas SAP no backoffice | leitura |
| API_CUSTOMER_RETURN_SRV | Devoluções — **não ativo (404)** | — |

### O que foi confirmado no sistema S20 (29/10/2026)
- Sistema partilhado por vários grupos (utilizadores LEARN-nnn): filtrar sempre pelos materiais do grupo.
- **Perfumes no SAP:** `PERF001-093` ("Âmbar Amadeirado") completo a 31/10: material em `HD00`, 50 un. em `TG00`, PR00 89,00 EUR (`DS00`/`WH`, tabela 304). Stock lançado na app Fiori **Manage Stock** → Add Storage Location → Initial Entry of Stock (o `MIGO` não tem "Other" neste sistema); pode demorar minutos a aparecer no OData. Preço criado na app **Manage Prices - Sales** (tabela 304, Release Status = Released).
- `UI_PRODUCTLIST` → entidade `ProductList` (chave `ID`; uma linha por produto × centro). Campos úteis: `Product`, `ProductDescription`, `Plant`, `ProductType`, `ProductGroup`, `BaseUnit`, `InventoryPrice`, `Currency`, `CreatedByUser`. `$count`/`$select` não são permitidos; `$filter`, `$top`, `$skip` funcionam.
- `C_STOCKQUANTITYVALUEBYTYPE_CDS` → `C_STOCKQUANTITYVALUEBYTYPE`. **Filtro `Plant` obrigatório.** Quantidade em `MatlWrhsStkQtyInMatlBaseUnit`; somar as linhas com `InventoryStockTypeName = 'Unrestricted-Use Stock'`.
- `SD_PRICING_CONDITIONRECORD_SRV` → `C_SlsPricingConditionRecordTP`. **Filtro rápido (~1,5 s):** `ConditionTable eq '304' and ConditionType eq 'PR00' and SalesOrganization eq 'DS00' and DistributionChannel eq 'WH' and Material eq '…'`. **Não usar `IsActiveEntity eq true` no filtro** (o pedido demora >2 min e dá timeout); filtrar `IsActiveEntity === true` no código, porque podem existir rascunhos. Preço em `ConditionRateValue` / `ConditionRateValueUnit`. Tabela 304 = Sales org./Distr. Chl/Product.
- `MD_CUSTOMER_MASTER_SRV_01` (testado a 06/11): o rascunho funciona de ponta a ponta (`src/lib/integration/sap-customers.ts`) e aparece na app Fiori para o `LEARN-093`. **A ativação funciona no Fiori e por API, mas por API só dentro de um `$batch`:** `C_BusinessPartnerCustomerPreparation` + `C_BusinessPartnerCustomerActivation` no mesmo changeset (testado a 06/11: parceiro `1003850`). Em pedidos POST separados dá HTTP 400 "Ocorreu uma exceção". Na app: `activateCustomerDraft()` com `sapBatch()`. Agrupamento `0001` = numeração interna; `0002` e `GPIN` exigem número externo e recusaram os números testados (`R1/091`).
- Escrita OData: `PATCH`, `DELETE` e `POST` com corpo **não aceitam `$format`** (HTTP 400); function imports aceitam. `sap-message` pode trazer erros com HTTP 200.
- `SD_F1814_SO_FS_SRV` → `C_Salesorderfs` / `C_Salesorderitemfs`.
- `API_CUSTOMER_RETURN_SRV` → **404, não está ativo**.
- APIs standard de escrita `API_PRODUCT_SRV`, `API_MATERIAL_DOCUMENT_SRV`, `API_SLSPRICINGCONDITIONRECORD_SRV`, `API_BUSINESS_PARTNER` → **403 (sem permissão)**.
- `MD_C_PRODUCT_MAINTAIN_SRV` (06/11): **criar material por API funciona.** Passos testados com `PERF002-093`: `C_ProductCopywithparams` (Product='OHMT1000', IsActiveEntity=true, DraftUUID=guid zero, Plant, Storagelocation) → `PATCH` `ProductForEdit` + `ProductDescription` → `PATCH` em todas as linhas de `to_Description` (senão fica "Off Road Helmet" noutros idiomas) → `POST to_SalesDelivery` e `PATCH` `ProductSalesOrgForEdit`/`ProductDistributionChnlForEdit` (o parâmetro `Salesorgdata` da cópia não trouxe vendas em nenhum formato testado) → `$batch` com `C_ProductPreparation` + `C_ProductActivation` no mesmo changeset. O dump de 31/10 foi com pedidos separados; com `$batch` não voltou a aparecer (não repeti a ativação separada para comparar). O material herda do modelo o grupo `SFTY`, peso 15 OZ e preço de inventário 25 EUR. Ainda não está na app.
- **Stock não pode ser lançado por API** (sem acesso a movimentos de mercadoria): entrada de stock é sempre manual no SAP (`MIGO`, movimento 561).
- Estrutura organizacional usada (Global Bike): centro `HD00`, depósito `TG00`, org. vendas `DS00`, canal `WH`, moeda EUR. Material modelo para copiar: `OHMT1000` (HAWA). Códigos dos nossos materiais: `PERFnnn-093`.

- **Descrições são por idioma:** os pedidos têm de levar `sap-language=PT` (já incluído em `sap.ts`), senão a descrição vem vazia.
- Script de exploração: `node scripts/sap-query.mjs <SERVIÇO> <EntitySet> "<$filter>" [top] [campos]`.

Notas SAP: POST exige token CSRF (GET com `x-csrf-token: fetch`, reutilizar token + cookies). Usar `$filter`, `$top`, `$skip`, `$select`, `$format=json`.

## Moloni
- Token: grant password / refresh_token (renovar automaticamente). Pedidos em paralelo partilham o mesmo token; se o Moloni responder "Invalid access token", `moloniCall` pede outro e repete uma vez.
- Artigos com stock: `has_stock: 1` + `at_product_category: "M"`; armazém GLOBAL (514955); `productStocks/insert` aceita `qty` negativa (saída); `products/update` mantém o IVA se reenviarmos `taxes`.
- customers/insert, invoices/insert (fatura-recibo), PDF da fatura
- IDs necessários: company_id, document_set_id, tax_id, unit_id (em `.env`)
- Configurado a 31/10: empresa **FragranGSI** (company_id 403295; a conta também tem a "Empresa Demonstração", id 5, que não se usa), série "M" (975430), IVA Normal 23% (3936365), unidade "Unidade" (3819255). Para voltar a listar: `node --env-file=.env scripts/moloni-ids.mjs [company_id]`.
- Os pedidos `getAll` respondem com uma lista; os erros vêm como lista de `{ code, description }`, `{ valid: 0 }` ou `{ error }` (ver `isErrorList` em `moloni.ts`).
- Os tokens OAuth nunca vão para o IntegrationLog (o log do grant guarda só `expires_in`).
- **Faturação bloqueada até a conta ser ativada (31/10):** `invoiceReceipts/insert` falha com `5 document_set_id / document_set_wsat_id` — a série "M" não tem código ATCUD (`document_set_at_codes: []`, `for_invoice_receipt: 0`) e o NIF da empresa é "255214529_UM". O professor vai ativar as contas "_UM" no Moloni com uma role de teste; depois confirmar a série com `documentSets/getAll` e voltar a testar (primeiro com `status: 0`, rascunho). A "Empresa Demonstração" (id 5) tem séries com ATCUD fictício e serve de alternativa para testes.
- Já criado na FragranGSI (testes de 31/10): categoria "Perfumes" (10661082), cliente "Cliente Teste fragranGSI" NIF 999999990 (163193339), produto "Âmbar Amadeirado" ref. PERF001-093 a 72,3577 € + IVA 23% (244956655). `customers/insert`, `products/insert` e `productCategories/insert` funcionam. Pagamento Multibanco = 3460740; Pronto Pagamento = 2662835; Portugal = 1; Português = 1.

## Fluxos principais
1. Registo de cliente: `registerCustomer()` em `src/lib/customers.ts` cria o `User` na BD, o cliente real no Moloni (`moloniCustomerId`) e o parceiro ativo no SAP (`sapBusinessPartner`; rascunho + ativação por `$batch`). Se a ativação falhar, o rascunho fica em `sapDraftUuid` e "Tentar novamente" repete só a ativação; ao abrir `/admin/clientes`, `syncSapDrafts()` vê se esses rascunhos foram ativados no Fiori (procura o parceiro ativo do `SAP_USER` com o mesmo nome). Apagar (`deleteCustomer()`): remove do Moloni, o rascunho do SAP e a conta local; recusa clientes com encomendas; um parceiro ativo fica no SAP. Os dois ERPs são independentes: se um falhar, o outro continua e o monitor mostra "Tentar novamente". Hoje entra-se por `/admin/clientes/novo`; o registo na loja fica para quando houver Auth0.
2. Catálogo/produto: SAP (produto + preço) + stock de venda do Moloni, enriquecido com fotos e notas olfativas da BD local. `sapStock` = entradas no SAP; `stock` = vendável no Moloni.
   Stock: "Sincronizar com o SAP" (`syncMoloniProducts()` em `src/lib/moloni-products.ts`) cria os artigos, atualiza preços e passa só a **diferença** do stock do SAP (`MoloniProduct.sapStockSynced`), para não apagar vendas. Não é automático: sem sincronizar, uma entrada no SAP não chega à loja. O SAP nunca desce com as vendas.
3. Produtos no backoffice (`/admin/produtos`): lista os materiais do SAP (nome/preço/stock só leitura) + estado da ficha local; editar ficha (família, género, concentração, tamanho, notas, descrição, foto, destaque, visível); "remover" = esconder da loja (`ProductInfo.visible`). "Novo produto" é guiado: cria a ficha e mostra os passos para criar material, stock e PR00 no SAP à mão; o produto aparece na loja quando o material existir no SAP. Criar o material por API já funciona (ver "O que foi confirmado"), mas ainda não está no backoffice.
4. Carrinho e checkout: qualquer visitante adiciona ao carrinho (cookie httpOnly `carrinho` com o id do `Cart` na BD; `src/lib/cart.ts` + Server Actions em `src/app/(loja)/carrinho/actions.ts`). O login só é exigido em /checkout. Checkout: valida stock no Moloni → fatura-recibo no Moloni (ao fechar, o Moloni desconta o stock) → confirmação com PDF.
5. Cada chamada a SAP/Moloni é registada (hora, sistema, operação, referência, estado, duração, resposta); erros com "Tentar novamente".
7. Analista IA no backoffice (`/admin/analista` + API Route `/api/admin/analista`): conversa livre sobre a loja. Também como separador flutuante em todas as páginas do /admin (`AnalystWidget`: minimizar/abrir, várias conversas, apagar, abrir em ecrã inteiro); estado partilhado em `AnalystProvider` (layout do admin), guardado no localStorage do browser (passar para a BD quando houver Auth0). O servidor gera um resumo agregado (`buildSnapshot()` em `src/lib/analytics.ts`: vendas por dia/perfume/dia da semana, 7 dias vs. semana anterior, clientes agregados, carrinhos, catálogo SAP, integrações) e envia-o ao Gemini com o histórico (`geminiChat`). **Sem dados pessoais** (nomes/emails/moradas) — o analista responde que não os tem. Instruído a não inventar números e a avisar quando há dados de demonstração.
8. Dados de demonstração (`src/lib/demo-data.ts`): botão "Gerar/Apagar dados de demonstração" no dashboard e no analista; ~110 encomendas fictícias em 30 dias + 40 clientes `cliente.demo.N@example.com`, marcados `isDemo` (User e Order). Usam o PERF001-093 e os perfumes planeados com preços inventados; tendências propositadas (Oud Imperial e Couro & Tabaco a subir, Brisa Salgada a descer). **Apagar antes de haver vendas reais.**
6. Assistente IA (`/assistente` + API Route `/api/recomendar`, `src/lib/recommend.ts`): envia ao Gemini só os perfumes à venda (stock > 0, com preço, visíveis) e aceita apenas códigos dessa lista. Sem chave ou com o Gemini a falhar → plano B por regras (notas olfativas). Limite 10 pedidos/min por IP. Respostas da IA em cache 10 min (em memória; a chave inclui respostas + catálogo enviado) para poupar quota. Modelos lite disponíveis: `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` (`gemini-2.5-flash-lite` retirado para contas novas). Gemini: `GEMINI_API_KEY` + `GEMINI_MODEL` no `.env`; usar **`gemini-3.5-flash-lite`** (~0,5 s; escolhido a 31/10). Testado a 31/10: `gemini-2.5-flash` já não está disponível para contas novas e `gemini-3.8-flash` / `gemini-flash-latest` demoram > 60 s.

## Design (ver /mockups — ficheiros .dc.html são HTML com estilos inline; usar como referência visual, não copiar a estrutura)
- Loja: fundo #12110F, superfície #1C1A17, linhas #2E2A25, texto #EFE9DF, secundário #A39A8C, dourado #C9A96E
- Backoffice: fundo #F7F6F3, cartões #FFFFFF, linhas #E4E1DB, texto #1A1917, secundário #5F5B54; sucesso #1F7A4D, erro #B3261E
- Tipografia: Bodoni Moda (títulos), Manrope (texto)
- Ecrãs: Main, Catalogo, Produto, Assistente, Carrinho, Checkout, Confirmacao, Conta, AdminDashboard, AdminEncomendas, AdminIntegracao (+ AdminProdutos e AdminClientes, sem mockup)
- Backoffice em /admin, protegido por role admin (Auth0). **Decisão (31/10): a proteção do /admin é a última tarefa do projeto**; até lá está aberto (só em localhost).

## Regras
- Nunca expor credenciais no frontend nem em logs.
- Tratar erros de cada integração e mostrar mensagens claras.
- Código explicável: o grupo tem de saber justificar cada parte na apresentação.

## Comandos
- `npm run dev` — servidor de desenvolvimento (http://localhost:3000)
- `npx prisma migrate dev --name <nome>` — aplicar alterações ao schema; depois `npx prisma generate`
- `npx prisma db seed` — dados iniciais da ficha do `PERF001-093` (o caminho normal é editar as fichas em `/admin/produtos`)

## Notas técnicas
- Next.js 16 com `cacheComponents`: dados por pedido (BD, SAP, cookies) têm de ficar dentro de `<Suspense>`; `params`/`cookies()` são assíncronos; `middleware` chama-se `proxy`.
- Prisma 7: cliente gerado em `src/generated/prisma` (import de `@/generated/prisma/client`), SQLite via adapter better-sqlite3 (`src/lib/db.ts`).
- Catálogo: `getCatalog()` em `src/lib/catalog.ts` junta SAP (produtos com prefixo `SAP_PRODUCT_PREFIX` no centro `SAP_PLANT`, stock tipo `01`, PR00) + stock do Moloni (`fetchMoloniStock()`, categoria Perfumes) + `ProductInfo` local. Usa `"use cache"` + `cacheLife("minutes")` + `cacheTag("catalogo")`; chamar depois de `await connection()` para não ir ao SAP no build. O stock tem de ser revalidado ao vivo no Moloni no checkout.
- Sessão: `getCurrentUser()` em `src/lib/auth.ts` é o único ponto a ligar ao Auth0 (hoje devolve sempre null).
- Monitor de integração em `/admin/integracao`. "Tentar novamente": `withLog({ retry: { action, payload } })` guarda a ação; as funções que a repetem estão em `RETRY_HANDLERS` (`src/app/admin/integracao/actions.ts`). Existem `sync-catalogo`, `cliente-moloni` e `cliente-sap`; cada fluxo novo (fatura) deve registar a sua.
- Loja usa `getStoreCatalog()` (só produtos visíveis, com ficha e com preço; os esgotados continuam); o backoffice usa `getCatalog()` (todos). Depois de alterar uma ficha, chamar `updateTag("catalogo")`.
- Fotos de produto: gravadas em `uploads/produtos/` (fora do git) e servidas pela rota `/fotos/[nome]`; limite 4 MB (`serverActions.bodySizeLimit` = 5mb em `next.config.ts`).
- Fotos do design já em `uploads/produtos/<código>.png`; ao guardar uma ficha sem foto, é usada automaticamente (`findPhotoFor`). Perfumes planeados: `PERF002-093` Flor de Laranjeira, `PERF003-093` Cedro Atlântico, `PERF004-093` Figo Verde, `PERF005-093` Rosa Noturna, `PERF006-093` Limão do Algarve, `PERF007-093` Couro & Tabaco, `PERF008-093` Brisa Salgada, `PERF009-093` Íris Pó, `PERF010-093` Chá Verde & Mate, `PERF011-093` Oud Imperial.
- Chamadas externas passam sempre por `withLog()` (`src/lib/integration/log.ts`) para ficarem no IntegrationLog.
