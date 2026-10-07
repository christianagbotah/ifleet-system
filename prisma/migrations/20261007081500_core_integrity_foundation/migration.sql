-- AlterTable
ALTER TABLE `FuelLog` ADD COLUMN `capturedBy` VARCHAR(191) NULL,
    ADD COLUMN `eventType` ENUM('purchase', 'company_issue', 'external_issue', 'emergency', 'tank_observation', 'reversal') NOT NULL DEFAULT 'purchase',
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `paymentSource` VARCHAR(191) NULL,
    ADD COLUMN `reversalOfId` VARCHAR(191) NULL,
    ADD COLUMN `source` ENUM('manual', 'driver_app', 'admin', 'gps', 'import', 'integration', 'system') NOT NULL DEFAULT 'manual',
    ADD COLUMN `verificationStatus` ENUM('pending', 'verified', 'rejected', 'superseded') NOT NULL DEFAULT 'pending';

-- Existing fuel logs predate verification workflow and are treated as accepted historical records.
UPDATE `FuelLog` SET `verificationStatus` = 'verified' WHERE `verificationStatus` = 'pending';

-- AlterTable
ALTER TABLE `WeightVerification` ADD COLUMN `varianceClass` ENUM('within_tolerance', 'over', 'under') NOT NULL DEFAULT 'within_tolerance';

-- CreateTable
CREATE TABLE `TripSequence` (
    `id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastValue` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TripSequence_year_key`(`year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OdometerReading` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NULL,
    `reading` DOUBLE NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readingType` ENUM('trip_start', 'trip_end', 'fuel', 'maintenance', 'inspection', 'manual_adjustment', 'import') NOT NULL,
    `source` ENUM('manual', 'driver_app', 'admin', 'gps', 'import', 'integration', 'system') NOT NULL DEFAULT 'manual',
    `verificationStatus` ENUM('pending', 'verified', 'rejected', 'superseded') NOT NULL DEFAULT 'pending',
    `evidence` TEXT NULL,
    `capturedBy` VARCHAR(191) NULL,
    `adjustmentReason` TEXT NULL,
    `supersedesId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OdometerReading_truckId_recordedAt_idx`(`truckId`, `recordedAt`),
    INDEX `OdometerReading_tripId_recordedAt_idx`(`tripId`, `recordedAt`),
    INDEX `OdometerReading_verificationStatus_idx`(`verificationStatus`),
    INDEX `OdometerReading_supersedesId_idx`(`supersedesId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TripReconciliation` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `distanceKm` DOUBLE NULL,
    `fuelAddedLiters` DOUBLE NOT NULL DEFAULT 0,
    `consumedLiters` DOUBLE NULL,
    `consumptionBasis` VARCHAR(191) NULL,
    `fuelCost` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `kmPerLiter` DOUBLE NULL,
    `litersPer100Km` DOUBLE NULL,
    `fuelCostPerKm` DECIMAL(65, 30) NULL,
    `expenseCost` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `revenue` DECIMAL(65, 30) NULL,
    `exceptionCount` INTEGER NOT NULL DEFAULT 0,
    `exceptions` TEXT NULL,
    `reconciledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reconciledBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TripReconciliation_tripId_key`(`tripId`),
    INDEX `TripReconciliation_reconciledAt_idx`(`reconciledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `FuelLog_eventType_idx` ON `FuelLog`(`eventType`);

-- CreateIndex
CREATE INDEX `FuelLog_verificationStatus_idx` ON `FuelLog`(`verificationStatus`);

-- CreateIndex
CREATE INDEX `FuelLog_reversalOfId_idx` ON `FuelLog`(`reversalOfId`);

-- CreateIndex
CREATE INDEX `FuelLog_tripId_date_idx` ON `FuelLog`(`tripId`, `date`);

-- CreateIndex
CREATE INDEX `FuelLog_truckId_date_idx` ON `FuelLog`(`truckId`, `date`);

-- CreateIndex
CREATE INDEX `WeightVerification_varianceClass_idx` ON `WeightVerification`(`varianceClass`);

-- AddForeignKey
ALTER TABLE `FuelLog` ADD CONSTRAINT `FuelLog_reversalOfId_fkey` FOREIGN KEY (`reversalOfId`) REFERENCES `FuelLog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OdometerReading` ADD CONSTRAINT `OdometerReading_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OdometerReading` ADD CONSTRAINT `OdometerReading_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OdometerReading` ADD CONSTRAINT `OdometerReading_supersedesId_fkey` FOREIGN KEY (`supersedesId`) REFERENCES `OdometerReading`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripReconciliation` ADD CONSTRAINT `TripReconciliation_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
