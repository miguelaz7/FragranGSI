-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductInfo" (
    "sapProduct" TEXT NOT NULL PRIMARY KEY,
    "family" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "concentration" TEXT NOT NULL,
    "sizeMl" INTEGER NOT NULL,
    "topNotes" TEXT NOT NULL,
    "heartNotes" TEXT NOT NULL,
    "baseNotes" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_ProductInfo" ("baseNotes", "concentration", "description", "family", "featured", "gender", "heartNotes", "imageUrl", "sapProduct", "sizeMl", "topNotes") SELECT "baseNotes", "concentration", "description", "family", "featured", "gender", "heartNotes", "imageUrl", "sapProduct", "sizeMl", "topNotes" FROM "ProductInfo";
DROP TABLE "ProductInfo";
ALTER TABLE "new_ProductInfo" RENAME TO "ProductInfo";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
