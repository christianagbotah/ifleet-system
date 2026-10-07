-- AlterTable
ALTER TABLE `DispatchRecommendation`
    ADD COLUMN `explanationSource` VARCHAR(191) NULL,
    ADD COLUMN `explanationOutput` LONGTEXT NULL,
    ADD COLUMN `explanationAt` DATETIME(3) NULL;
