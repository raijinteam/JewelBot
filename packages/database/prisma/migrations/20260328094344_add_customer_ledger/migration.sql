-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CREDIT', 'PAYMENT');

-- CreateTable
CREATE TABLE "ledger_customers" (
    "id" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outstanding" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_customers_ownerPhone_name_key" ON "ledger_customers"("ownerPhone", "name");

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ledger_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
