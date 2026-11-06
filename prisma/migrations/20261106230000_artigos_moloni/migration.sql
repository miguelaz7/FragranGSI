-- CreateTable
CREATE TABLE "MoloniProduct" (
    "sapProduct" TEXT NOT NULL PRIMARY KEY,
    "moloniProductId" INTEGER NOT NULL,
    "sapStockSynced" REAL NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "MoloniProduct_moloniProductId_key" ON "MoloniProduct"("moloniProductId");
