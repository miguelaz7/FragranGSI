-- A app liga-se ao PostgreSQL como dona das tabelas (o RLS não se lhe aplica).
-- Com RLS ligado e sem políticas, a Data API do Supabase (anon/authenticated)
-- não lê nada destas tabelas, mesmo que alguém a ative no painel.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductInfo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MoloniProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
