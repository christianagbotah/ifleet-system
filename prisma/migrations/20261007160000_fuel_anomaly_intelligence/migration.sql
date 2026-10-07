-- CreateTable
CREATE TABLE `FuelAnomalyAssessment` (
    `id` VARCHAR(191) NOT NULL,
    `subjectType` ENUM('fuel_event', 'trip', 'truck_window') NOT NULL,
    `subjectKey` VARCHAR(191) NOT NULL,
    `fuelLogId` VARCHAR(191) NULL,
    `tripId` VARCHAR(191) NULL,
    `truckId` VARCHAR(191) NULL,
    `requestedBy` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rulesetVersion` VARCHAR(64) NOT NULL,
    `baselineVersion` VARCHAR(64) NOT NULL,
    `inputHash` VARCHAR(64) NOT NULL,
    `inputSnapshot` LONGTEXT NOT NULL,
    `overallRiskScore` INTEGER NOT NULL,
    `overallSeverity` ENUM('info', 'low', 'medium', 'high', 'critical') NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `dataQuality` DOUBLE NOT NULL,
    `status` ENUM('open', 'acknowledged', 'investigating', 'resolved', 'false_positive') NOT NULL DEFAULT 'open',
    `explanationSource` VARCHAR(191) NULL,
    `explanationProvider` VARCHAR(191) NULL,
    `explanationModel` VARCHAR(191) NULL,
    `explanationOutput` LONGTEXT NULL,
    `explanationAt` DATETIME(3) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNotes` TEXT NULL,
    `outcomeCode` ENUM('verified_legitimate', 'data_entry_error', 'duplicate_record', 'mechanical_issue', 'route_or_operational_factor', 'supplier_or_price_issue', 'fuel_loss_confirmed', 'policy_violation_confirmed', 'insufficient_evidence', 'other') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FuelAnomalyAssessment_identity_key`(`subjectType`, `subjectKey`, `rulesetVersion`, `baselineVersion`, `inputHash`),
    INDEX `FuelAnomalyAssessment_status_idx`(`status`),
    INDEX `FuelAnomalyAssessment_overallSeverity_idx`(`overallSeverity`),
    INDEX `FuelAnomalyAssessment_truckId_idx`(`truckId`),
    INDEX `FuelAnomalyAssessment_tripId_idx`(`tripId`),
    INDEX `FuelAnomalyAssessment_fuelLogId_idx`(`fuelLogId`),
    INDEX `FuelAnomalyAssessment_requestedAt_idx`(`requestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FuelAnomalyFinding` (
    `id` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(96) NOT NULL,
    `severity` ENUM('info', 'low', 'medium', 'high', 'critical') NOT NULL,
    `riskContribution` INTEGER NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `dataQuality` DOUBLE NOT NULL,
    `evidence` LONGTEXT NOT NULL,
    `reason` TEXT NOT NULL,
    `recommendedAction` TEXT NOT NULL,
    `fuelLogId` VARCHAR(191) NULL,
    `tripId` VARCHAR(191) NULL,
    `truckId` VARCHAR(191) NULL,
    `driverId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FuelAnomalyFinding_assessmentId_idx`(`assessmentId`),
    INDEX `FuelAnomalyFinding_code_idx`(`code`),
    INDEX `FuelAnomalyFinding_severity_idx`(`severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FuelAnomalyReviewEvent` (
    `id` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('open', 'acknowledged', 'investigating', 'resolved', 'false_positive') NOT NULL,
    `toStatus` ENUM('open', 'acknowledged', 'investigating', 'resolved', 'false_positive') NOT NULL,
    `outcomeCode` ENUM('verified_legitimate', 'data_entry_error', 'duplicate_record', 'mechanical_issue', 'route_or_operational_factor', 'supplier_or_price_issue', 'fuel_loss_confirmed', 'policy_violation_confirmed', 'insufficient_evidence', 'other') NULL,
    `notes` TEXT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FuelAnomalyReviewEvent_assessmentId_createdAt_idx`(`assessmentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FuelAnomalyFinding` ADD CONSTRAINT `FuelAnomalyFinding_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `FuelAnomalyAssessment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FuelAnomalyReviewEvent` ADD CONSTRAINT `FuelAnomalyReviewEvent_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `FuelAnomalyAssessment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
