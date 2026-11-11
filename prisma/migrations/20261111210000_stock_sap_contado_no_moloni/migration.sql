-- O stock do SAP já passado para o Moloni passa a contar-se nos movimentos do Moloni
-- (partilhado), em vez de ficar na BD local de cada PC.
ALTER TABLE "MoloniProduct" DROP COLUMN "sapStockSynced";
