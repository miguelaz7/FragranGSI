-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "invoiceStatus" TEXT NOT NULL DEFAULT 'pendente',
    "total" REAL NOT NULL,
    "moloniDocumentId" INTEGER,
    "moloniDocumentNo" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "id", "invoiceStatus", "moloniDocumentId", "moloniDocumentNo", "status", "total", "userId") SELECT "createdAt", "id", "invoiceStatus", "moloniDocumentId", "moloniDocumentNo", "status", "total", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nif" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "sapBusinessPartner" TEXT,
    "moloniCustomerId" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("address", "city", "createdAt", "email", "id", "moloniCustomerId", "name", "nif", "passwordHash", "postalCode", "role", "sapBusinessPartner") SELECT "address", "city", "createdAt", "email", "id", "moloniCustomerId", "name", "nif", "passwordHash", "postalCode", "role", "sapBusinessPartner" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_sapBusinessPartner_key" ON "User"("sapBusinessPartner");
CREATE UNIQUE INDEX "User_moloniCustomerId_key" ON "User"("moloniCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
