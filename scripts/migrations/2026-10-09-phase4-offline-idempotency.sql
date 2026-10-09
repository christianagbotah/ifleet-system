-- Phase 4 offline driver synchronization idempotency keys.
-- Safe additive rollout: existing rows receive NULL, while future client mutation IDs are unique.
ALTER TABLE `Expense` ADD COLUMN IF NOT EXISTS `clientMutationId` VARCHAR(191) NULL;
ALTER TABLE `FuelLog` ADD COLUMN IF NOT EXISTS `clientMutationId` VARCHAR(191) NULL;
ALTER TABLE `TripEvent` ADD COLUMN IF NOT EXISTS `clientMutationId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `Expense_clientMutationId_key` ON `Expense`(`clientMutationId`);
CREATE UNIQUE INDEX IF NOT EXISTS `FuelLog_clientMutationId_key` ON `FuelLog`(`clientMutationId`);
CREATE UNIQUE INDEX IF NOT EXISTS `TripEvent_clientMutationId_key` ON `TripEvent`(`clientMutationId`);
