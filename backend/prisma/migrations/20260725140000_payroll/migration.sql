-- Payroll: employees, monthly runs, payslips and editable statutory rates.

CREATE TABLE `Employee` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `staffNo` VARCHAR(191) NOT NULL,
  `firstName` VARCHAR(191) NOT NULL,
  `lastName` VARCHAR(191) NOT NULL,
  `nationalId` VARCHAR(191) NULL,
  `kraPin` VARCHAR(191) NULL,
  `nssfNo` VARCHAR(191) NULL,
  `shifNo` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `jobTitle` VARCHAR(191) NULL,
  `employmentType` ENUM('PERMANENT', 'CONTRACT', 'CASUAL', 'INTERN') NOT NULL DEFAULT 'PERMANENT',
  `branchId` INTEGER NULL,
  `userId` INTEGER NULL,
  `basicSalary` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `houseAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `transportAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `otherAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `otherDeductions` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `bankName` VARCHAR(191) NULL,
  `bankAccount` VARCHAR(191) NULL,
  `hiredAt` DATETIME(3) NULL,
  `endedAt` DATETIME(3) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `uuid` VARCHAR(191) NOT NULL,

  UNIQUE INDEX `Employee_staffNo_key`(`staffNo`),
  UNIQUE INDEX `Employee_userId_key`(`userId`),
  UNIQUE INDEX `Employee_uuid_key`(`uuid`),
  INDEX `Employee_branchId_active_idx`(`branchId`, `active`),
  INDEX `Employee_deletedAt_idx`(`deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollRun` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `year` INTEGER NOT NULL,
  `month` INTEGER NOT NULL,
  `status` ENUM('DRAFT', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
  `note` VARCHAR(191) NULL,
  `grossTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `deductionsTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `netTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `employerTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `createdById` INTEGER NULL,
  `closedById` INTEGER NULL,
  `closedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PayrollRun_year_month_key`(`year`, `month`),
  INDEX `PayrollRun_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Payslip` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `runId` INTEGER NOT NULL,
  `employeeId` INTEGER NOT NULL,
  `branchId` INTEGER NULL,
  `basicSalary` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `allowances` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `grossPay` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `nssf` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `shif` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `housingLevy` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `taxablePay` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `paye` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `otherDeductions` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `totalDeductions` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `netPay` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `employerNssf` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `employerHousingLevy` DECIMAL(12, 2) NOT NULL DEFAULT 0,

  UNIQUE INDEX `Payslip_runId_employeeId_key`(`runId`, `employeeId`),
  INDEX `Payslip_employeeId_idx`(`employeeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollSetting` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `payeBands` TEXT NOT NULL,
  `personalRelief` DECIMAL(12, 2) NOT NULL DEFAULT 2400,
  `insuranceRelief` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `nssfTier1Limit` DECIMAL(12, 2) NOT NULL DEFAULT 8000,
  `nssfTier2Limit` DECIMAL(12, 2) NOT NULL DEFAULT 72000,
  `nssfRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.06,
  `shifRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.0275,
  `shifMinimum` DECIMAL(12, 2) NOT NULL DEFAULT 300,
  `housingLevyRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.015,
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Employee`
  ADD CONSTRAINT `Employee_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Employee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Payslip`
  ADD CONSTRAINT `Payslip_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `PayrollRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `Payslip_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Link salary expenses back to the payroll run that produced them.
ALTER TABLE `Expense`
  ADD COLUMN `payrollRunId` INTEGER NULL;

CREATE INDEX `Expense_payrollRunId_idx` ON `Expense`(`payrollRunId`);

-- Seed the statutory rates in force today (Kenya, 2025). Editable in Settings.
INSERT INTO `PayrollSetting`
  (`id`, `payeBands`, `personalRelief`, `insuranceRelief`, `nssfTier1Limit`, `nssfTier2Limit`, `nssfRate`, `shifRate`, `shifMinimum`, `housingLevyRate`, `updatedAt`)
VALUES
  (1,
   '[{"upTo":24000,"rate":0.10},{"upTo":32333,"rate":0.25},{"upTo":500000,"rate":0.30},{"upTo":800000,"rate":0.325},{"upTo":null,"rate":0.35}]',
   2400, 0, 8000, 72000, 0.06, 0.0275, 300, 0.015, CURRENT_TIMESTAMP(3));
