-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `avatar` VARCHAR(191) NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `employeeNumber` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLogin` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_employeeNumber_key`(`employeeNumber`),
    INDEX `User_isActive_idx`(`isActive`),
    INDEX `User_roleId_idx`(`roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `details` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `AuditLog_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BorderCrossing` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `borderName` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `status` ENUM('queued', 'processing', 'cleared', 'rejected') NOT NULL DEFAULT 'queued',
    `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processingAt` DATETIME(3) NULL,
    `clearedAt` DATETIME(3) NULL,
    `estimatedWait` INTEGER NULL,
    `actualWait` INTEGER NULL,
    `clearanceFee` DECIMAL(65, 30) NULL,
    `documentStatus` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BorderCrossing_borderName_idx`(`borderName`),
    INDEX `BorderCrossing_country_idx`(`country`),
    INDEX `BorderCrossing_createdBy_fkey`(`createdBy`),
    INDEX `BorderCrossing_direction_idx`(`direction`),
    INDEX `BorderCrossing_driverId_idx`(`driverId`),
    INDEX `BorderCrossing_queuedAt_idx`(`queuedAt`),
    INDEX `BorderCrossing_status_idx`(`status`),
    INDEX `BorderCrossing_tripId_idx`(`tripId`),
    INDEX `BorderCrossing_truckId_idx`(`truckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CashAdvance` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `mobileMoneyRef` VARCHAR(191) NULL,
    `mobileMoneyNetwork` VARCHAR(191) NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'disbursed', 'partially_deducted', 'fully_deducted') NOT NULL DEFAULT 'pending',
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `disbursedBy` VARCHAR(191) NULL,
    `disbursedAt` DATETIME(3) NULL,
    `totalDeducted` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `remainingBalance` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `requestDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CashAdvance_driverId_status_idx`(`driverId`, `status`),
    INDEX `CashAdvance_requestDate_idx`(`requestDate`),
    INDEX `CashAdvance_status_idx`(`status`),
    INDEX `CashAdvance_tripId_idx`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NOT NULL,
    `contactPerson` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Client_companyName_idx`(`companyName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientZone` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `destinationZoneId` VARCHAR(191) NOT NULL,
    `branchName` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `contactPerson` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClientZone_clientId_idx`(`clientId`),
    INDEX `ClientZone_destinationZoneId_idx`(`destinationZoneId`),
    UNIQUE INDEX `ClientZone_clientId_destinationZoneId_key`(`clientId`, `destinationZoneId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Currency` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Currency_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryStop` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `stopOrder` INTEGER NOT NULL,
    `destination` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `customerName` VARCHAR(191) NULL,
    `customerPhone` VARCHAR(191) NULL,
    `expectedQty` DOUBLE NOT NULL,
    `actualQty` DOUBLE NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'bags',
    `status` ENUM('pending', 'arrived', 'offloading', 'completed', 'skipped') NOT NULL DEFAULT 'pending',
    `arrivalTime` DATETIME(3) NULL,
    `offloadStarted` DATETIME(3) NULL,
    `offloadCompleted` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeliveryStop_tripId_stopOrder_idx`(`tripId`, `stopOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DepotQueue` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NULL,
    `tripId` VARCHAR(191) NULL,
    `depotName` VARCHAR(191) NOT NULL,
    `queueType` VARCHAR(191) NOT NULL,
    `status` ENUM('waiting', 'in_progress', 'loading', 'unloading', 'completed', 'cancelled') NOT NULL DEFAULT 'waiting',
    `position` INTEGER NULL,
    `estimatedWait` INTEGER NULL,
    `actualWait` INTEGER NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DepotQueue_createdBy_fkey`(`createdBy`),
    INDEX `DepotQueue_depotName_idx`(`depotName`),
    INDEX `DepotQueue_driverId_fkey`(`driverId`),
    INDEX `DepotQueue_joinedAt_idx`(`joinedAt`),
    INDEX `DepotQueue_queueType_idx`(`queueType`),
    INDEX `DepotQueue_status_idx`(`status`),
    INDEX `DepotQueue_tripId_fkey`(`tripId`),
    INDEX `DepotQueue_truckId_idx`(`truckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DestinationCity` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DestinationCity_name_key`(`name`),
    INDEX `DestinationCity_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DestinationZone` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `destinationCityId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DestinationZone_destinationCityId_idx`(`destinationCityId`),
    INDEX `DestinationZone_isActive_idx`(`isActive`),
    UNIQUE INDEX `DestinationZone_name_destinationCityId_key`(`name`, `destinationCityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `uploadedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Document_category_idx`(`category`),
    INDEX `Document_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `Document_uploadedBy_idx`(`uploadedBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Driver` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `address` VARCHAR(191) NULL,
    `photo` VARCHAR(191) NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `ghanaCardNumber` VARCHAR(191) NULL,
    `ghanaCardExpiry` DATETIME(3) NULL,
    `licenseNumber` VARCHAR(191) NOT NULL,
    `licenseExpiry` DATETIME(3) NOT NULL,
    `licenseClass` VARCHAR(191) NOT NULL,
    `licenseImage` VARCHAR(191) NULL,
    `ghanaCardFrontImage` VARCHAR(191) NULL,
    `ghanaCardBackImage` VARCHAR(191) NULL,
    `emergencyName` VARCHAR(191) NULL,
    `emergencyPhone` VARCHAR(191) NULL,
    `verificationStatus` ENUM('pending', 'verified', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
    `verifiedBy` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `verificationNotes` VARCHAR(191) NULL,
    `notifySMS` BOOLEAN NOT NULL DEFAULT true,
    `notifyEmail` BOOLEAN NOT NULL DEFAULT true,
    `notifyPush` BOOLEAN NOT NULL DEFAULT true,
    `rating` DOUBLE NOT NULL DEFAULT 5,
    `status` ENUM('active', 'inactive', 'suspended', 'resigned') NOT NULL DEFAULT 'active',
    `totalTrips` INTEGER NOT NULL DEFAULT 0,
    `totalMileage` DOUBLE NOT NULL DEFAULT 0,
    `hireDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Driver_userId_key`(`userId`),
    UNIQUE INDEX `Driver_phone_key`(`phone`),
    UNIQUE INDEX `Driver_email_key`(`email`),
    UNIQUE INDEX `Driver_employeeId_key`(`employeeId`),
    UNIQUE INDEX `Driver_ghanaCardNumber_key`(`ghanaCardNumber`),
    UNIQUE INDEX `Driver_licenseNumber_key`(`licenseNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriverIncentive` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NULL,
    `periodEnd` DATETIME(3) NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'paid') NOT NULL DEFAULT 'pending',
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `metrics` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DriverIncentive_amount_idx`(`amount`),
    INDEX `DriverIncentive_approvedBy_fkey`(`approvedBy`),
    INDEX `DriverIncentive_createdBy_fkey`(`createdBy`),
    INDEX `DriverIncentive_driverId_idx`(`driverId`),
    INDEX `DriverIncentive_period_idx`(`period`),
    INDEX `DriverIncentive_status_idx`(`status`),
    INDEX `DriverIncentive_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriverSettlement` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `grossEarnings` DECIMAL(65, 30) NOT NULL,
    `fuelDeductions` DECIMAL(65, 30) NOT NULL,
    `expenseDeductions` DECIMAL(65, 30) NOT NULL,
    `bonusAmount` DECIMAL(65, 30) NOT NULL,
    `netPay` DECIMAL(65, 30) NOT NULL,
    `status` ENUM('pending', 'approved', 'paid') NOT NULL DEFAULT 'pending',
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DriverSettlement_driverId_period_idx`(`driverId`, `period`),
    INDEX `DriverSettlement_periodEnd_idx`(`periodEnd`),
    INDEX `DriverSettlement_periodStart_idx`(`periodStart`),
    INDEX `DriverSettlement_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriverWallet` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `availableBalance` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `totalAdvances` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `totalDeducted` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `totalSettled` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `monthlyAdvanceLimit` DECIMAL(65, 30) NULL,
    `monthlyAdvancesThisMonth` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `lastAdvanceDate` DATETIME(3) NULL,
    `mobileMoneyNumber` VARCHAR(191) NULL,
    `mobileMoneyNetwork` VARCHAR(191) NULL,
    `preferredPaymentMethod` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DriverWallet_driverId_key`(`driverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DvlaRegistration` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `registrationNumber` VARCHAR(191) NOT NULL,
    `certificateNumber` VARCHAR(191) NOT NULL,
    `vehicleClass` VARCHAR(191) NOT NULL,
    `bodyType` VARCHAR(191) NULL,
    `axleConfiguration` VARCHAR(191) NULL,
    `grossVehicleWeight` DOUBLE NULL,
    `unladenWeight` DOUBLE NULL,
    `seatingCapacity` INTEGER NULL,
    `engineCapacity` VARCHAR(191) NULL,
    `yearOfManufacture` INTEGER NULL,
    `countryOfOrigin` VARCHAR(191) NULL,
    `registeredOwner` VARCHAR(191) NOT NULL,
    `ownerAddress` VARCHAR(191) NULL,
    `ownerContact` VARCHAR(191) NULL,
    `dvlaOffice` VARCHAR(191) NULL,
    `registrationDate` DATETIME(3) NOT NULL,
    `expiryDate` DATETIME(3) NOT NULL,
    `lastRenewalDate` DATETIME(3) NULL,
    `nextRenewalDue` DATETIME(3) NULL,
    `registrationFee` DECIMAL(65, 30) NULL,
    `renewalFee` DECIMAL(65, 30) NULL,
    `status` ENUM('active', 'expired', 'cancelled', 'suspended') NOT NULL DEFAULT 'active',
    `documentUrl` VARCHAR(191) NULL,
    `transferHistory` TEXT NULL,
    `notes` VARCHAR(191) NULL,
    `reminderSent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DvlaRegistration_registrationNumber_key`(`registrationNumber`),
    UNIQUE INDEX `DvlaRegistration_certificateNumber_key`(`certificateNumber`),
    INDEX `DvlaRegistration_expiryDate_idx`(`expiryDate`),
    INDEX `DvlaRegistration_registeredOwner_idx`(`registeredOwner`),
    INDEX `DvlaRegistration_truckId_status_idx`(`truckId`, `status`),
    INDEX `DvlaRegistration_vehicleClass_idx`(`vehicleClass`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `reference` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `status` ENUM('approved', 'pending', 'rejected') NOT NULL DEFAULT 'approved',
    `receiptUrl` VARCHAR(191) NULL,
    `tripId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Expense_category_idx`(`category`),
    INDEX `Expense_date_idx`(`date`),
    INDEX `Expense_status_idx`(`status`),
    INDEX `Expense_tripId_idx`(`tripId`),
    INDEX `Expense_truckId_date_idx`(`truckId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseApproval` (
    `id` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `requestedById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvalLevel` INTEGER NOT NULL DEFAULT 1,
    `amount` DECIMAL(65, 30) NOT NULL,
    `approvedAmount` DECIMAL(65, 30) NULL,
    `notes` VARCHAR(191) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ExpenseApproval_expenseId_key`(`expenseId`),
    INDEX `ExpenseApproval_approvedById_idx`(`approvedById`),
    INDEX `ExpenseApproval_createdAt_idx`(`createdAt`),
    INDEX `ExpenseApproval_expenseId_idx`(`expenseId`),
    INDEX `ExpenseApproval_requestedById_idx`(`requestedById`),
    INDEX `ExpenseApproval_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FuelBudget` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `budgetLimit` DECIMAL(65, 30) NOT NULL,
    `litersLimit` DOUBLE NULL,
    `actualSpend` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `actualLiters` DOUBLE NOT NULL DEFAULT 0,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,

    INDEX `FuelBudget_month_idx`(`month`),
    INDEX `FuelBudget_truckId_idx`(`truckId`),
    INDEX `FuelBudget_year_idx`(`year`),
    UNIQUE INDEX `FuelBudget_truckId_month_year_key`(`truckId`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FuelLog` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `odometer` DOUBLE NULL,
    `fuelLevelBefore` DOUBLE NULL,
    `fuelLevelAfter` DOUBLE NULL,
    `litersFilled` DOUBLE NOT NULL,
    `costPerLiter` DECIMAL(65, 30) NULL,
    `totalCost` DECIMAL(65, 30) NOT NULL,
    `stationName` VARCHAR(191) NULL,
    `fuelType` VARCHAR(191) NOT NULL DEFAULT 'Diesel',
    `receiptNumber` VARCHAR(191) NULL,
    `endMileage` DOUBLE NULL,
    `endMileageImage` TEXT NULL,
    `images` TEXT NULL,
    `distanceCovered` DOUBLE NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FuelLog_date_idx`(`date`),
    INDEX `FuelLog_fuelType_idx`(`fuelType`),
    INDEX `FuelLog_tripId_idx`(`tripId`),
    INDEX `FuelLog_truckId_idx`(`truckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FuelPrice` (
    `id` VARCHAR(191) NOT NULL,
    `stationId` VARCHAR(191) NOT NULL,
    `fuelType` VARCHAR(191) NOT NULL,
    `pricePerLiter` DECIMAL(65, 30) NOT NULL,
    `effectiveDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FuelPrice_effectiveDate_idx`(`effectiveDate`),
    INDEX `FuelPrice_fuelType_idx`(`fuelType`),
    UNIQUE INDEX `FuelPrice_stationId_fuelType_effectiveDate_key`(`stationId`, `fuelType`, `effectiveDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FuelStation` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL,
    `stationCode` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `route` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `operatingHours` VARCHAR(191) NULL,
    `hasCardPayment` BOOLEAN NOT NULL DEFAULT false,
    `hasLoyaltyProgram` BOOLEAN NOT NULL DEFAULT false,
    `hasHGV` BOOLEAN NOT NULL DEFAULT true,
    `hasAdBlue` BOOLEAN NOT NULL DEFAULT false,
    `hasWorkshop` BOOLEAN NOT NULL DEFAULT false,
    `corporateRatePerLiter` DECIMAL(65, 30) NULL,
    `rating` DOUBLE NULL,
    `totalRatings` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FuelStation_stationCode_key`(`stationCode`),
    INDEX `FuelStation_brand_idx`(`brand`),
    INDEX `FuelStation_city_idx`(`city`),
    INDEX `FuelStation_route_idx`(`route`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeofenceZone` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `radius` INTEGER NOT NULL DEFAULT 500,
    `type` VARCHAR(191) NOT NULL DEFAULT 'depot',
    `address` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GeofenceZone_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Insurance` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `policyNumber` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `coverAmount` DECIMAL(65, 30) NULL,
    `premium` DECIMAL(65, 30) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `status` ENUM('active', 'expired', 'cancelled', 'pending') NOT NULL DEFAULT 'active',
    `renewalReminderSent` BOOLEAN NOT NULL DEFAULT false,
    `documentUrl` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Insurance_policyNumber_key`(`policyNumber`),
    INDEX `Insurance_endDate_idx`(`endDate`),
    INDEX `Insurance_truckId_status_idx`(`truckId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsuranceClaim` (
    `id` VARCHAR(191) NOT NULL,
    `insuranceId` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `claimNumber` VARCHAR(191) NOT NULL,
    `claimType` VARCHAR(191) NOT NULL,
    `incidentDate` DATETIME(3) NOT NULL,
    `incidentLocation` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'paid', 'closed') NOT NULL DEFAULT 'draft',
    `claimAmount` DECIMAL(65, 30) NOT NULL,
    `approvedAmount` DECIMAL(65, 30) NULL,
    `deductible` DECIMAL(65, 30) NULL,
    `assignedAdjuster` VARCHAR(191) NULL,
    `policeReport` TEXT NULL,
    `thirdPartyDetails` TEXT NULL,
    `damagePhotos` TEXT NULL,
    `repairEstimate` DECIMAL(65, 30) NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `assessorNotes` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InsuranceClaim_claimNumber_key`(`claimNumber`),
    INDEX `InsuranceClaim_claimAmount_idx`(`claimAmount`),
    INDEX `InsuranceClaim_claimType_idx`(`claimType`),
    INDEX `InsuranceClaim_createdBy_fkey`(`createdBy`),
    INDEX `InsuranceClaim_incidentDate_idx`(`incidentDate`),
    INDEX `InsuranceClaim_insuranceId_idx`(`insuranceId`),
    INDEX `InsuranceClaim_status_idx`(`status`),
    INDEX `InsuranceClaim_truckId_idx`(`truckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NULL,
    `issueDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueDate` DATETIME(3) NOT NULL,
    `status` ENUM('pending', 'draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled', 'void') NOT NULL DEFAULT 'draft',
    `subtotal` DECIMAL(65, 30) NOT NULL,
    `taxAmount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `taxRate` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(65, 30) NOT NULL,
    `paidAmount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `notes` VARCHAR(191) NULL,
    `terms` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    UNIQUE INDEX `Invoice_tripId_key`(`tripId`),
    INDEX `Invoice_clientId_idx`(`clientId`),
    INDEX `Invoice_dueDate_idx`(`dueDate`),
    INDEX `Invoice_issueDate_idx`(`issueDate`),
    INDEX `Invoice_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceItem` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `quantity` DECIMAL(65, 30) NOT NULL,
    `unitPrice` DECIMAL(65, 30) NOT NULL,
    `total` DECIMAL(65, 30) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `InvoiceItem_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Item` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'bags',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `supplierId` VARCHAR(191) NULL,

    UNIQUE INDEX `Item_name_key`(`name`),
    INDEX `Item_isActive_idx`(`isActive`),
    INDEX `Item_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoadBoard` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `pickupLocation` VARCHAR(191) NOT NULL,
    `dropoffLocation` VARCHAR(191) NOT NULL,
    `pickupRegion` VARCHAR(191) NOT NULL,
    `dropoffRegion` VARCHAR(191) NOT NULL,
    `commodityType` VARCHAR(191) NOT NULL,
    `weight` DOUBLE NULL,
    `truckType` VARCHAR(191) NULL,
    `truckCount` INTEGER NOT NULL DEFAULT 1,
    `offeredRate` DECIMAL(65, 30) NULL,
    `budgetMin` DECIMAL(65, 30) NULL,
    `budgetMax` DECIMAL(65, 30) NULL,
    `pickupDate` DATETIME(3) NULL,
    `deliveryDate` DATETIME(3) NULL,
    `status` ENUM('open', 'assigned', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
    `requirements` VARCHAR(191) NULL,
    `contactName` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `assignedTruckId` VARCHAR(191) NULL,
    `assignedDriverId` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LoadBoard_assignedDriverId_fkey`(`assignedDriverId`),
    INDEX `LoadBoard_assignedTruckId_fkey`(`assignedTruckId`),
    INDEX `LoadBoard_clientId_idx`(`clientId`),
    INDEX `LoadBoard_commodityType_idx`(`commodityType`),
    INDEX `LoadBoard_createdAt_idx`(`createdAt`),
    INDEX `LoadBoard_createdBy_fkey`(`createdBy`),
    INDEX `LoadBoard_dropoffRegion_idx`(`dropoffRegion`),
    INDEX `LoadBoard_pickupDate_idx`(`pickupDate`),
    INDEX `LoadBoard_pickupRegion_idx`(`pickupRegion`),
    INDEX `LoadBoard_status_idx`(`status`),
    INDEX `LoadBoard_truckType_idx`(`truckType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoadingCity` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LoadingCity_name_key`(`name`),
    INDEX `LoadingCity_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoadingPoint` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `loadingCityId` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `contactPerson` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `supplierId` VARCHAR(191) NULL,

    INDEX `LoadingPoint_isActive_idx`(`isActive`),
    INDEX `LoadingPoint_loadingCityId_idx`(`loadingCityId`),
    INDEX `LoadingPoint_supplierId_idx`(`supplierId`),
    UNIQUE INDEX `LoadingPoint_name_loadingCityId_key`(`name`, `loadingCityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaintenanceRecord` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `odometer` DOUBLE NULL,
    `cost` DECIMAL(65, 30) NULL,
    `performedBy` VARCHAR(191) NULL,
    `performedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `nextDueDate` DATETIME(3) NULL,
    `nextDueMileage` DOUBLE NULL,
    `status` ENUM('pending', 'scheduled', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'completed',
    `partsUsed` TEXT NULL,
    `invoiceUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MaintenanceRecord_nextDueDate_idx`(`nextDueDate`),
    INDEX `MaintenanceRecord_truckId_status_idx`(`truckId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL DEFAULT 'in_app',
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `link` VARCHAR(191) NULL,
    `metadata` TEXT NULL,
    `smsSent` BOOLEAN NOT NULL DEFAULT false,
    `smsSentAt` DATETIME(3) NULL,
    `smsError` VARCHAR(191) NULL,
    `emailSent` BOOLEAN NOT NULL DEFAULT false,
    `emailSentAt` DATETIME(3) NULL,
    `emailError` VARCHAR(191) NULL,
    `pushSent` BOOLEAN NOT NULL DEFAULT false,
    `pushSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_createdAt_idx`(`createdAt`),
    INDEX `Notification_isRead_idx`(`isRead`),
    INDEX `Notification_type_idx`(`type`),
    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_token_key`(`token`),
    INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
    INDEX `PasswordResetToken_token_idx`(`token`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payroll` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `baseSalary` DECIMAL(65, 30) NOT NULL,
    `tripBonus` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `overtimePay` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `deductions` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `netPay` DECIMAL(65, 30) NOT NULL,
    `status` ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    `paidAt` DATETIME(3) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payroll_driverId_month_year_key`(`driverId`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PerformanceBenchmark` (
    `id` VARCHAR(191) NOT NULL,
    `destinationZoneId` VARCHAR(191) NOT NULL,
    `expectedMinMileage` DOUBLE NOT NULL,
    `expectedMaxMileage` DOUBLE NOT NULL,
    `warningMinMileage` DOUBLE NULL,
    `warningMaxMileage` DOUBLE NULL,
    `expectedMinFuel` DOUBLE NULL,
    `expectedMaxFuel` DOUBLE NULL,
    `warningMinFuel` DOUBLE NULL,
    `warningMaxFuel` DOUBLE NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PerformanceBenchmark_destinationZoneId_idx`(`destinationZoneId`),
    INDEX `PerformanceBenchmark_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pricing` (
    `id` VARCHAR(191) NOT NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `destination` VARCHAR(191) NOT NULL,
    `transportRate` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `effectiveDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Pricing_itemName_destination_key`(`itemName`, `destination`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportHistory` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `format` VARCHAR(191) NOT NULL,
    `parameters` VARCHAR(191) NULL,
    `generatedBy` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NULL,
    `status` ENUM('pending', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'completed',
    `error` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReportHistory_createdAt_idx`(`createdAt`),
    INDEX `ReportHistory_generatedBy_idx`(`generatedBy`),
    INDEX `ReportHistory_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoadConditionReport` (
    `id` VARCHAR(191) NOT NULL,
    `reporterId` VARCHAR(191) NOT NULL,
    `roadName` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NOT NULL,
    `condition` VARCHAR(191) NOT NULL,
    `hazardType` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `reportedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `status` ENUM('active', 'resolved', 'dismissed') NOT NULL DEFAULT 'active',
    `imageUrl` TEXT NULL,
    `tripId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RoadConditionReport_condition_idx`(`condition`),
    INDEX `RoadConditionReport_hazardType_idx`(`hazardType`),
    INDEX `RoadConditionReport_region_idx`(`region`),
    INDEX `RoadConditionReport_reportedAt_idx`(`reportedAt`),
    INDEX `RoadConditionReport_reporterId_idx`(`reporterId`),
    INDEX `RoadConditionReport_severity_idx`(`severity`),
    INDEX `RoadConditionReport_status_idx`(`status`),
    INDEX `RoadConditionReport_tripId_fkey`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoadworthyInspection` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `certificateNumber` VARCHAR(191) NOT NULL,
    `inspectionType` VARCHAR(191) NOT NULL,
    `inspectionDate` DATETIME(3) NOT NULL,
    `inspectionStation` VARCHAR(191) NULL,
    `inspectorName` VARCHAR(191) NULL,
    `inspectorId` VARCHAR(191) NULL,
    `inspectorSignature` VARCHAR(191) NULL,
    `result` VARCHAR(191) NOT NULL,
    `vehicleFitness` VARCHAR(191) NOT NULL DEFAULT 'fit',
    `brakesCheck` VARCHAR(191) NOT NULL DEFAULT 'pass',
    `lightsCheck` VARCHAR(191) NOT NULL DEFAULT 'pass',
    `tyresCheck` VARCHAR(191) NOT NULL DEFAULT 'pass',
    `emissionsCheck` VARCHAR(191) NOT NULL DEFAULT 'pass',
    `steeringCheck` VARCHAR(191) NOT NULL DEFAULT 'pass',
    `suspensionCheck` VARCHAR(191) NOT NULL DEFAULT 'pass',
    `bodyCheck` VARCHAR(191) NOT NULL DEFAULT 'pass',
    `electricalCheck` VARCHAR(191) NOT NULL DEFAULT 'pass',
    `odometerReading` DOUBLE NULL,
    `defectsFound` TEXT NULL,
    `advisories` TEXT NULL,
    `recommendations` TEXT NULL,
    `certificateIssued` BOOLEAN NOT NULL DEFAULT false,
    `certificateExpiry` DATETIME(3) NULL,
    `certificateUrl` VARCHAR(191) NULL,
    `inspectionFee` DECIMAL(65, 30) NULL,
    `nextInspectionDue` DATETIME(3) NULL,
    `status` ENUM('pending', 'scheduled', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'completed',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RoadworthyInspection_certificateNumber_key`(`certificateNumber`),
    INDEX `RoadworthyInspection_certificateExpiry_idx`(`certificateExpiry`),
    INDEX `RoadworthyInspection_inspectionDate_idx`(`inspectionDate`),
    INDEX `RoadworthyInspection_result_idx`(`result`),
    INDEX `RoadworthyInspection_truckId_status_idx`(`truckId`, `status`),
    INDEX `RoadworthyInspection_vehicleFitness_idx`(`vehicleFitness`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `permissions` TEXT NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SettlementLine` (
    `id` VARCHAR(191) NOT NULL,
    `settlementId` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NULL,
    `description` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(65, 30) NOT NULL,

    INDEX `SettlementLine_settlementId_idx`(`settlementId`),
    INDEX `SettlementLine_tripId_fkey`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contactPerson` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Supplier_name_key`(`name`),
    INDEX `Supplier_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSettings` (
    `id` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT true,
    `companyName` VARCHAR(191) NOT NULL DEFAULT 'iFleetPro Ltd.',
    `companyEmail` VARCHAR(191) NOT NULL DEFAULT 'info@fleetpro.com.gh',
    `companyPhone` VARCHAR(191) NOT NULL DEFAULT '+233 30 277 8899',
    `companyAddress` VARCHAR(191) NOT NULL DEFAULT '37 Ring Road Central',
    `companyCity` VARCHAR(191) NOT NULL DEFAULT 'Accra',
    `companyCountry` VARCHAR(191) NOT NULL DEFAULT 'Ghana',
    `companyWebsite` VARCHAR(191) NOT NULL DEFAULT 'www.fleetpro.com.gh',
    `registrationNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `notifyTripStarted` BOOLEAN NOT NULL DEFAULT true,
    `notifyTripCompleted` BOOLEAN NOT NULL DEFAULT true,
    `notifyMaintenanceDue` BOOLEAN NOT NULL DEFAULT true,
    `notifyInsuranceExpiring` BOOLEAN NOT NULL DEFAULT true,
    `notifySpeedingAlert` BOOLEAN NOT NULL DEFAULT true,
    `notifyGeofenceAlert` BOOLEAN NOT NULL DEFAULT true,
    `notifyDriverOffline` BOOLEAN NOT NULL DEFAULT true,
    `notifyDailyReport` BOOLEAN NOT NULL DEFAULT false,
    `smsProvider` VARCHAR(191) NOT NULL DEFAULT 'hubtel',
    `smsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `hubtelClientId` VARCHAR(191) NOT NULL DEFAULT '',
    `hubtelApiSecret` VARCHAR(191) NOT NULL DEFAULT '',
    `arkeselApiKey` VARCHAR(191) NOT NULL DEFAULT '',
    `arkeselSenderId` VARCHAR(191) NOT NULL DEFAULT '',
    `paystackEnabled` BOOLEAN NOT NULL DEFAULT false,
    `paystackSecretKey` VARCHAR(191) NOT NULL DEFAULT '',
    `paystackPublicKey` VARCHAR(191) NOT NULL DEFAULT '',
    `paystackMode` VARCHAR(191) NOT NULL DEFAULT 'test',
    `mobileMoneyProvider` VARCHAR(191) NOT NULL DEFAULT 'mtn',
    `paystackWebhookSecret` VARCHAR(191) NOT NULL DEFAULT '',
    `emailEnabled` BOOLEAN NOT NULL DEFAULT false,
    `smtpHost` VARCHAR(191) NOT NULL DEFAULT '',
    `smtpPort` INTEGER NOT NULL DEFAULT 587,
    `smtpUser` VARCHAR(191) NOT NULL DEFAULT '',
    `smtpPass` VARCHAR(191) NOT NULL DEFAULT '',
    `smtpFrom` VARCHAR(191) NOT NULL DEFAULT '',
    `smtpSecure` BOOLEAN NOT NULL DEFAULT true,
    `defaultUpdateInterval` INTEGER NOT NULL DEFAULT 30,
    `speedThreshold` INTEGER NOT NULL DEFAULT 80,
    `enableGeofence` BOOLEAN NOT NULL DEFAULT true,
    `idleTimeout` INTEGER NOT NULL DEFAULT 15,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'GHS',
    `distanceUnit` VARCHAR(191) NOT NULL DEFAULT 'km',
    `fuelUnit` VARCHAR(191) NOT NULL DEFAULT 'litres',
    `dateFormat` VARCHAR(191) NOT NULL DEFAULT 'DD/MM/YYYY',
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Africa/Accra',
    `language` VARCHAR(191) NOT NULL DEFAULT 'English',
    `driverIdPrefix` VARCHAR(191) NOT NULL DEFAULT 'FP-DRV-',
    `driverIdCounter` INTEGER NOT NULL DEFAULT 1,
    `driverIdPadding` INTEGER NOT NULL DEFAULT 3,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SystemSettings_isDefault_key`(`isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TollRecord` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NULL,
    `tripId` VARCHAR(191) NULL,
    `tollPoint` VARCHAR(191) NOT NULL,
    `tollType` VARCHAR(191) NOT NULL DEFAULT 'toll',
    `location` VARCHAR(191) NULL,
    `route` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `referenceNumber` VARCHAR(191) NULL,
    `tollDate` DATETIME(3) NOT NULL,
    `direction` VARCHAR(191) NULL,
    `status` ENUM('pending', 'verified', 'disputed', 'resolved') NOT NULL DEFAULT 'verified',
    `disputeReason` VARCHAR(191) NULL,
    `resolvedBy` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `vehicleWeight` DOUBLE NULL,
    `overloaded` BOOLEAN NOT NULL DEFAULT false,
    `overloadFine` DECIMAL(65, 30) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TollRecord_driverId_idx`(`driverId`),
    INDEX `TollRecord_route_idx`(`route`),
    INDEX `TollRecord_tollDate_idx`(`tollDate`),
    INDEX `TollRecord_tollType_idx`(`tollType`),
    INDEX `TollRecord_tripId_idx`(`tripId`),
    INDEX `TollRecord_truckId_tollDate_idx`(`truckId`, `tollDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrackingAlert` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NULL,
    `geofenceZoneId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TrackingAlert_geofenceZoneId_fkey`(`geofenceZoneId`),
    INDEX `TrackingAlert_isRead_idx`(`isRead`),
    INDEX `TrackingAlert_tripId_fkey`(`tripId`),
    INDEX `TrackingAlert_truckId_createdAt_idx`(`truckId`, `createdAt`),
    INDEX `TrackingAlert_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrackingConfig` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `enablePhoneGps` BOOLEAN NOT NULL DEFAULT true,
    `enableHardware` BOOLEAN NOT NULL DEFAULT false,
    `updateInterval` INTEGER NOT NULL DEFAULT 5,
    `geofenceRadius` INTEGER NOT NULL DEFAULT 500,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TrackingConfig_truckId_key`(`truckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Trip` (
    `id` VARCHAR(191) NOT NULL,
    `tripNumber` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `waybillNumber` VARCHAR(191) NULL,
    `orderNumber` VARCHAR(191) NULL,
    `loadingLocation` VARCHAR(191) NOT NULL,
    `loadingAddress` VARCHAR(191) NULL,
    `loadingLat` DOUBLE NULL,
    `loadingLng` DOUBLE NULL,
    `destination` VARCHAR(191) NOT NULL,
    `destinationAddress` VARCHAR(191) NULL,
    `destLat` DOUBLE NULL,
    `destLng` DOUBLE NULL,
    `itemId` VARCHAR(191) NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'bags',
    `unitPrice` DECIMAL(65, 30) NULL,
    `totalRevenue` DECIMAL(65, 30) NULL,
    `departureTime` DATETIME(3) NOT NULL,
    `arrivalTime` DATETIME(3) NULL,
    `estimatedDuration` DOUBLE NULL,
    `actualDuration` DOUBLE NULL,
    `startMileage` DOUBLE NULL,
    `endMileage` DOUBLE NULL,
    `totalMileage` DOUBLE NULL,
    `fuelLevelBefore` DOUBLE NULL,
    `fuelLevelAfter` DOUBLE NULL,
    `fuelUsed` DOUBLE NULL,
    `fuelCost` DECIMAL(65, 30) NULL,
    `startMileageImage` TEXT NULL,
    `deliveryType` VARCHAR(191) NOT NULL DEFAULT 'SINGLE',
    `loadingCityId` VARCHAR(191) NULL,
    `loadingPointId` VARCHAR(191) NULL,
    `destinationCityId` VARCHAR(191) NULL,
    `destinationZoneId` VARCHAR(191) NULL,
    `status` ENUM('scheduled', 'loading', 'loaded', 'departed_depot', 'in_transit', 'arrived_destination', 'offloading', 'offloaded', 'return_journey', 'arrived_depot', 'completed', 'cancelled', 'delayed') NOT NULL DEFAULT 'scheduled',
    `waitingReason` VARCHAR(191) NULL,
    `waitingSince` DATETIME(3) NULL,
    `loadingStartedAt` DATETIME(3) NULL,
    `loadingCompletedAt` DATETIME(3) NULL,
    `totalOffloaded` DOUBLE NOT NULL DEFAULT 0,
    `offloadingStartedAt` DATETIME(3) NULL,
    `offloadingCompletedAt` DATETIME(3) NULL,
    `customerName` VARCHAR(191) NULL,
    `customerPhone` VARCHAR(191) NULL,
    `customerRef` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Trip_tripNumber_key`(`tripNumber`),
    INDEX `Trip_clientId_idx`(`clientId`),
    INDEX `Trip_deliveryType_idx`(`deliveryType`),
    INDEX `Trip_departureTime_idx`(`departureTime`),
    INDEX `Trip_destinationCityId_idx`(`destinationCityId`),
    INDEX `Trip_destinationZoneId_idx`(`destinationZoneId`),
    INDEX `Trip_driverId_idx`(`driverId`),
    INDEX `Trip_itemId_idx`(`itemId`),
    INDEX `Trip_loadingCityId_idx`(`loadingCityId`),
    INDEX `Trip_loadingPointId_idx`(`loadingPointId`),
    INDEX `Trip_status_departureTime_idx`(`status`, `departureTime`),
    INDEX `Trip_status_idx`(`status`),
    INDEX `Trip_truckId_idx`(`truckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TripComment` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TripComment_tripId_createdAt_idx`(`tripId`, `createdAt`),
    INDEX `TripComment_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TripDeliveryDestination` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `destinationZoneId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerPhone` VARCHAR(191) NULL,
    `stopOrder` INTEGER NOT NULL,
    `status` ENUM('pending', 'in_transit', 'arrived', 'offloading', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `actualQty` DOUBLE NULL,
    `address` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `zoneRate` DECIMAL(65, 30) NULL,

    INDEX `TripDeliveryDestination_clientId_idx`(`clientId`),
    INDEX `TripDeliveryDestination_destinationZoneId_idx`(`destinationZoneId`),
    INDEX `TripDeliveryDestination_status_idx`(`status`),
    INDEX `TripDeliveryDestination_tripId_idx`(`tripId`),
    INDEX `TripDeliveryDestination_tripId_stopOrder_idx`(`tripId`, `stopOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TripEvent` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TripEvent_tripId_createdAt_idx`(`tripId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TripItem` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NULL,
    `loadingPointId` VARCHAR(191) NULL,
    `itemId` VARCHAR(191) NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'bags',
    `quantity` DOUBLE NOT NULL,
    `rate` DECIMAL(65, 30) NULL,
    `total` DECIMAL(65, 30) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `deliveryDestinationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TripItem_deliveryDestinationId_idx`(`deliveryDestinationId`),
    INDEX `TripItem_itemId_idx`(`itemId`),
    INDEX `TripItem_loadingPointId_fkey`(`loadingPointId`),
    INDEX `TripItem_supplierId_idx`(`supplierId`),
    INDEX `TripItem_tripId_idx`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Truck` (
    `id` VARCHAR(191) NOT NULL,
    `plateNumber` VARCHAR(191) NOT NULL,
    `make` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `vinNumber` VARCHAR(191) NULL,
    `engineNumber` VARCHAR(191) NULL,
    `chassisNumber` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `fuelType` VARCHAR(191) NOT NULL DEFAULT 'Diesel',
    `tankCapacity` DOUBLE NULL,
    `status` ENUM('active', 'inactive', 'maintenance', 'out_of_service', 'retired', 'decommissioned') NOT NULL DEFAULT 'active',
    `currentMileage` DOUBLE NOT NULL DEFAULT 0,
    `driverId` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `insuranceStatus` ENUM('none', 'active', 'expired', 'pending') NOT NULL DEFAULT 'none',
    `nextServiceDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Truck_plateNumber_key`(`plateNumber`),
    UNIQUE INDEX `Truck_vinNumber_key`(`vinNumber`),
    INDEX `Truck_driverId_fkey`(`driverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TruckLocation` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `speed` DOUBLE NULL,
    `heading` DOUBLE NULL,
    `accuracy` DOUBLE NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'phone',
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TruckLocation_tripId_idx`(`tripId`),
    INDEX `TruckLocation_truckId_timestamp_idx`(`truckId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tyre` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `serialNumber` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL,
    `purchaseDate` DATETIME(3) NOT NULL,
    `purchasePrice` DECIMAL(65, 30) NOT NULL,
    `condition` ENUM('new', 'good', 'fair', 'worn', 'damaged', 'retired') NOT NULL DEFAULT 'new',
    `lastInspection` DATETIME(3) NULL,
    `retiredDate` DATETIME(3) NULL,
    `retiredReason` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tyre_serialNumber_key`(`serialNumber`),
    INDEX `Tyre_truckId_idx`(`truckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehicleInspection` (
    `id` VARCHAR(191) NOT NULL,
    `truckId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NULL,
    `tripId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `inspectionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `odometerReading` DOUBLE NULL,
    `result` ENUM('pass', 'conditional_pass', 'fail') NOT NULL DEFAULT 'pass',
    `overallNotes` VARCHAR(191) NULL,
    `checkItems` VARCHAR(191) NOT NULL,
    `totalChecks` INTEGER NOT NULL DEFAULT 0,
    `passCount` INTEGER NOT NULL DEFAULT 0,
    `warningCount` INTEGER NOT NULL DEFAULT 0,
    `failCount` INTEGER NOT NULL DEFAULT 0,
    `defectsFound` BOOLEAN NOT NULL DEFAULT false,
    `defectDetails` VARCHAR(191) NULL,
    `photos` VARCHAR(191) NULL,
    `inspectedBy` VARCHAR(191) NULL,
    `inspectorName` VARCHAR(191) NULL,
    `signature` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `requiresFollowUp` BOOLEAN NOT NULL DEFAULT false,
    `followUpNotes` VARCHAR(191) NULL,
    `followUpCompletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VehicleInspection_driverId_idx`(`driverId`),
    INDEX `VehicleInspection_result_idx`(`result`),
    INDEX `VehicleInspection_tripId_idx`(`tripId`),
    INDEX `VehicleInspection_truckId_inspectionDate_idx`(`truckId`, `inspectionDate`),
    INDEX `VehicleInspection_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WarehouseItem` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `minStock` INTEGER NOT NULL DEFAULT 5,
    `unitPrice` DECIMAL(65, 30) NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'pcs',
    `warehouse` VARCHAR(191) NOT NULL DEFAULT 'Main Depot',
    `location` VARCHAR(191) NULL,
    `supplier` VARCHAR(191) NULL,
    `lastRestocked` DATETIME(3) NULL,
    `expiryDate` DATETIME(3) NULL,
    `status` ENUM('in_stock', 'low_stock', 'out_of_stock', 'expired', 'damaged') NOT NULL DEFAULT 'in_stock',
    `notes` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WarehouseItem_sku_key`(`sku`),
    INDEX `WarehouseItem_category_idx`(`category`),
    INDEX `WarehouseItem_createdBy_fkey`(`createdBy`),
    INDEX `WarehouseItem_quantity_idx`(`quantity`),
    INDEX `WarehouseItem_sku_idx`(`sku`),
    INDEX `WarehouseItem_status_idx`(`status`),
    INDEX `WarehouseItem_warehouse_idx`(`warehouse`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WeightVerification` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `checkpointType` VARCHAR(191) NOT NULL,
    `verifiedWeight` DOUBLE NOT NULL,
    `declaredWeight` DOUBLE NULL,
    `variance` DOUBLE NULL,
    `variancePercent` DOUBLE NULL,
    `status` ENUM('pending', 'verified', 'failed', 'variance_detected') NOT NULL DEFAULT 'verified',
    `verifiedBy` VARCHAR(191) NULL,
    `verifiedByName` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WeightVerification_checkpointType_idx`(`checkpointType`),
    INDEX `WeightVerification_createdAt_idx`(`createdAt`),
    INDEX `WeightVerification_status_idx`(`status`),
    INDEX `WeightVerification_tripId_idx`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZoneRate` (
    `id` VARCHAR(191) NOT NULL,
    `destinationZoneId` VARCHAR(191) NOT NULL,
    `rateAmount` DECIMAL(65, 30) NOT NULL,
    `minMileage` DOUBLE NULL,
    `maxMileage` DOUBLE NULL,
    `expectedFuelConsumption` DOUBLE NULL,
    `effectiveDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ZoneRate_destinationZoneId_idx`(`destinationZoneId`),
    INDEX `ZoneRate_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DvlaRenewalHistory` (
    `id` VARCHAR(191) NOT NULL,
    `dvlaRegistrationId` VARCHAR(191) NOT NULL,
    `previousData` TEXT NOT NULL,
    `renewalFee` DECIMAL(65, 30) NULL,
    `renewedByName` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DvlaRenewalHistory_dvlaRegistrationId_idx`(`dvlaRegistrationId`),
    INDEX `DvlaRenewalHistory_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsuranceRenewalHistory` (
    `id` VARCHAR(191) NOT NULL,
    `insuranceId` VARCHAR(191) NOT NULL,
    `previousData` TEXT NOT NULL,
    `renewalFee` DECIMAL(65, 30) NULL,
    `renewedByName` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InsuranceRenewalHistory_insuranceId_idx`(`insuranceId`),
    INDEX `InsuranceRenewalHistory_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BorderCrossing` ADD CONSTRAINT `BorderCrossing_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BorderCrossing` ADD CONSTRAINT `BorderCrossing_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BorderCrossing` ADD CONSTRAINT `BorderCrossing_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BorderCrossing` ADD CONSTRAINT `BorderCrossing_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashAdvance` ADD CONSTRAINT `CashAdvance_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashAdvance` ADD CONSTRAINT `CashAdvance_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientZone` ADD CONSTRAINT `ClientZone_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientZone` ADD CONSTRAINT `ClientZone_destinationZoneId_fkey` FOREIGN KEY (`destinationZoneId`) REFERENCES `DestinationZone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryStop` ADD CONSTRAINT `DeliveryStop_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepotQueue` ADD CONSTRAINT `DepotQueue_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepotQueue` ADD CONSTRAINT `DepotQueue_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepotQueue` ADD CONSTRAINT `DepotQueue_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepotQueue` ADD CONSTRAINT `DepotQueue_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DestinationZone` ADD CONSTRAINT `DestinationZone_destinationCityId_fkey` FOREIGN KEY (`destinationCityId`) REFERENCES `DestinationCity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Driver` ADD CONSTRAINT `Driver_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriverIncentive` ADD CONSTRAINT `DriverIncentive_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriverIncentive` ADD CONSTRAINT `DriverIncentive_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriverIncentive` ADD CONSTRAINT `DriverIncentive_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriverSettlement` ADD CONSTRAINT `DriverSettlement_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriverWallet` ADD CONSTRAINT `DriverWallet_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DvlaRegistration` ADD CONSTRAINT `DvlaRegistration_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseApproval` ADD CONSTRAINT `ExpenseApproval_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseApproval` ADD CONSTRAINT `ExpenseApproval_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseApproval` ADD CONSTRAINT `ExpenseApproval_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FuelBudget` ADD CONSTRAINT `FuelBudget_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FuelLog` ADD CONSTRAINT `FuelLog_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FuelLog` ADD CONSTRAINT `FuelLog_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FuelPrice` ADD CONSTRAINT `FuelPrice_stationId_fkey` FOREIGN KEY (`stationId`) REFERENCES `FuelStation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Insurance` ADD CONSTRAINT `Insurance_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsuranceClaim` ADD CONSTRAINT `InsuranceClaim_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsuranceClaim` ADD CONSTRAINT `InsuranceClaim_insuranceId_fkey` FOREIGN KEY (`insuranceId`) REFERENCES `Insurance`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsuranceClaim` ADD CONSTRAINT `InsuranceClaim_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoadBoard` ADD CONSTRAINT `LoadBoard_assignedDriverId_fkey` FOREIGN KEY (`assignedDriverId`) REFERENCES `Driver`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoadBoard` ADD CONSTRAINT `LoadBoard_assignedTruckId_fkey` FOREIGN KEY (`assignedTruckId`) REFERENCES `Truck`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoadBoard` ADD CONSTRAINT `LoadBoard_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoadBoard` ADD CONSTRAINT `LoadBoard_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoadingPoint` ADD CONSTRAINT `LoadingPoint_loadingCityId_fkey` FOREIGN KEY (`loadingCityId`) REFERENCES `LoadingCity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoadingPoint` ADD CONSTRAINT `LoadingPoint_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenanceRecord` ADD CONSTRAINT `MaintenanceRecord_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payroll` ADD CONSTRAINT `Payroll_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PerformanceBenchmark` ADD CONSTRAINT `PerformanceBenchmark_destinationZoneId_fkey` FOREIGN KEY (`destinationZoneId`) REFERENCES `DestinationZone`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoadConditionReport` ADD CONSTRAINT `RoadConditionReport_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoadConditionReport` ADD CONSTRAINT `RoadConditionReport_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoadworthyInspection` ADD CONSTRAINT `RoadworthyInspection_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SettlementLine` ADD CONSTRAINT `SettlementLine_settlementId_fkey` FOREIGN KEY (`settlementId`) REFERENCES `DriverSettlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SettlementLine` ADD CONSTRAINT `SettlementLine_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TollRecord` ADD CONSTRAINT `TollRecord_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TollRecord` ADD CONSTRAINT `TollRecord_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TollRecord` ADD CONSTRAINT `TollRecord_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrackingAlert` ADD CONSTRAINT `TrackingAlert_geofenceZoneId_fkey` FOREIGN KEY (`geofenceZoneId`) REFERENCES `GeofenceZone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrackingAlert` ADD CONSTRAINT `TrackingAlert_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrackingAlert` ADD CONSTRAINT `TrackingAlert_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrackingConfig` ADD CONSTRAINT `TrackingConfig_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_destinationCityId_fkey` FOREIGN KEY (`destinationCityId`) REFERENCES `DestinationCity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_destinationZoneId_fkey` FOREIGN KEY (`destinationZoneId`) REFERENCES `DestinationZone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_loadingCityId_fkey` FOREIGN KEY (`loadingCityId`) REFERENCES `LoadingCity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_loadingPointId_fkey` FOREIGN KEY (`loadingPointId`) REFERENCES `LoadingPoint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripComment` ADD CONSTRAINT `TripComment_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripComment` ADD CONSTRAINT `TripComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripDeliveryDestination` ADD CONSTRAINT `TripDeliveryDestination_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripDeliveryDestination` ADD CONSTRAINT `TripDeliveryDestination_destinationZoneId_fkey` FOREIGN KEY (`destinationZoneId`) REFERENCES `DestinationZone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripDeliveryDestination` ADD CONSTRAINT `TripDeliveryDestination_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripEvent` ADD CONSTRAINT `TripEvent_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripItem` ADD CONSTRAINT `TripItem_deliveryDestinationId_fkey` FOREIGN KEY (`deliveryDestinationId`) REFERENCES `TripDeliveryDestination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripItem` ADD CONSTRAINT `TripItem_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripItem` ADD CONSTRAINT `TripItem_loadingPointId_fkey` FOREIGN KEY (`loadingPointId`) REFERENCES `LoadingPoint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripItem` ADD CONSTRAINT `TripItem_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripItem` ADD CONSTRAINT `TripItem_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Truck` ADD CONSTRAINT `Truck_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TruckLocation` ADD CONSTRAINT `TruckLocation_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TruckLocation` ADD CONSTRAINT `TruckLocation_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tyre` ADD CONSTRAINT `Tyre_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleInspection` ADD CONSTRAINT `VehicleInspection_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleInspection` ADD CONSTRAINT `VehicleInspection_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleInspection` ADD CONSTRAINT `VehicleInspection_truckId_fkey` FOREIGN KEY (`truckId`) REFERENCES `Truck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarehouseItem` ADD CONSTRAINT `WarehouseItem_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WeightVerification` ADD CONSTRAINT `WeightVerification_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoneRate` ADD CONSTRAINT `ZoneRate_destinationZoneId_fkey` FOREIGN KEY (`destinationZoneId`) REFERENCES `DestinationZone`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DvlaRenewalHistory` ADD CONSTRAINT `DvlaRenewalHistory_dvlaRegistrationId_fkey` FOREIGN KEY (`dvlaRegistrationId`) REFERENCES `DvlaRegistration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsuranceRenewalHistory` ADD CONSTRAINT `InsuranceRenewalHistory_insuranceId_fkey` FOREIGN KEY (`insuranceId`) REFERENCES `Insurance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
