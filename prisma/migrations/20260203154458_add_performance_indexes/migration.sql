-- CreateIndex
CREATE INDEX "Facility_isActive_sortOrder_idx" ON "Facility"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Resident_facilityId_isActive_endDate_idx" ON "Resident"("facilityId", "isActive", "endDate");

-- CreateIndex
CREATE INDEX "Transaction_residentId_transactionDate_idx" ON "Transaction"("residentId", "transactionDate");

-- CreateIndex
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");

-- CreateIndex
CREATE INDEX "Unit_facilityId_isActive_idx" ON "Unit"("facilityId", "isActive");
