import { Prisma } from "@prisma/client";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";

const demoPrefix = "TQMS DEMO";
const rolePermissions = ["dashboard.view", "tenders.view", "items.view"];
const statuses = [
  "NEW",
  "PRICE_REQUESTED",
  "QUOTED",
  "SUBMITTED",
  "TENDER_READING_DONE",
  "AWARDED",
  "LOST",
  "PO_RECEIVED",
  "COMPLETED",
  "CANCELLED",
] as const;
const quotationStatuses = [
  "DRAFT",
  "DRAFT",
  "DRAFT",
  "PENDING_TENDER_MANAGER",
  "PENDING_DIRECTOR",
  "APPROVED",
  "REJECTED",
  "APPROVED",
  "APPROVED",
  "REJECTED",
] as const;
const tenderTypes = ["OPEN", "LETTERS", "WALK_IN"] as const;

const id = (table: string, index: number) =>
  `${table}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

function demoDate(daysFromToday: number): Date {
  const date = new Date();
  date.setUTCHours(9, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date;
}

function minimalPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document);
}

async function seedDemoData(): Promise<void> {
  if (config.NODE_ENV === "production") {
    throw new Error("Demo seeding is disabled when NODE_ENV is production.");
  }
  const databaseHost = new URL(config.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1", "db"].includes(databaseHost)) {
    throw new Error("Demo seeding is allowed only for a local database host.");
  }

  await prisma.$transaction(async (transaction) => {
    const admin = await transaction.user.findFirst({
      where: { role: "ADMIN", customRoleId: null, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, fullName: true },
    });
    if (!admin) {
      throw new Error("Create or activate an Administrator account before seeding demo data.");
    }

    await transaction.customRole.upsert({
      where: { id: id("d1000027", 1) },
      create: {
        id: id("d1000027", 1),
        name: `${demoPrefix} Read-only`,
        baseRole: "ADMIN",
        permissions: rolePermissions,
      },
      update: { name: `${demoPrefix} Read-only`, permissions: rolePermissions },
    });

    const categories = [];
    for (let index = 1; index <= 5; index += 1) {
      categories.push(await transaction.itemCategory.upsert({
        where: { id: id("d1000001", index) },
        create: { id: id("d1000001", index), name: `${demoPrefix} Category ${index.toString().padStart(2, "0")}` },
        update: { name: `${demoPrefix} Category ${index.toString().padStart(2, "0")}`, active: true },
      }));
    }
    const brands = [];
    for (let index = 1; index <= 5; index += 1) {
      brands.push(await transaction.brand.upsert({
        where: { id: id("d1000002", index) },
        create: { id: id("d1000002", index), name: `${demoPrefix} Brand ${index.toString().padStart(2, "0")}` },
        update: { name: `${demoPrefix} Brand ${index.toString().padStart(2, "0")}`, active: true },
      }));
    }
    const units = [];
    for (let index = 1; index <= 3; index += 1) {
      units.push(await transaction.unit.upsert({
        where: { id: id("d1000003", index) },
        create: {
          id: id("d1000003", index),
          name: `${demoPrefix} Unit ${index.toString().padStart(2, "0")}`,
          abbreviation: `DU${index}`,
        },
        update: {
          name: `${demoPrefix} Unit ${index.toString().padStart(2, "0")}`,
          abbreviation: `DU${index}`,
          active: true,
        },
      }));
    }

    const company = await transaction.companyProfile.findUnique({ where: { id: "default" } });
    if (!company) {
      await transaction.companyProfile.create({
        data: {
          id: "default",
          companyName: `${demoPrefix} Company`,
          address: "Demo address, Colombo",
          email: "demo@example.invalid",
          officePhone1: "0110000000",
          brNumber: "DEMO-BR-0001",
          vatRegistrationNumber: "DEMO-VAT-0001",
          quotationValidityDays: 30,
          vatRate: 15,
          minimumMarginPercent: 10,
        },
      });
    }

    for (let index = 1; index <= 20; index += 1) {
      const suffix = index.toString().padStart(2, "0");
      const category = categories[(index - 1) % categories.length];
      const brand = brands[(index - 1) % brands.length];
      const unit = units[(index - 1) % units.length];
      const item = await transaction.item.upsert({
        where: { id: id("d1000004", index) },
        create: {
          id: id("d1000004", index),
          code: `${demoPrefix.replaceAll(" ", "-")}-ITEM-${suffix}`,
          name: `${demoPrefix} Item ${suffix}`,
          categoryId: category.id,
          brandId: brand.id,
          modelSpecification: `Demo specification ${suffix}`,
          unitId: unit.id,
          warrantyMonths: 12 + index,
        },
        update: {
          name: `${demoPrefix} Item ${suffix}`,
          categoryId: category.id,
          brandId: brand.id,
          modelSpecification: `Demo specification ${suffix}`,
          unitId: unit.id,
          warrantyMonths: 12 + index,
          active: true,
        },
      });
      const supplier = await transaction.supplier.upsert({
        where: { id: id("d1000005", index) },
        create: {
          id: id("d1000005", index),
          name: `${demoPrefix} Supplier ${suffix}`,
          contactPerson: `Supplier Contact ${suffix}`,
          contactNumber: `011000${suffix}`,
          email: `supplier${suffix}@example.invalid`,
          address: `Demo supplier address ${suffix}`,
        },
        update: { name: `${demoPrefix} Supplier ${suffix}`, active: true },
      });
      const competitor = await transaction.competitor.upsert({
        where: { id: id("d1000006", index) },
        create: {
          id: id("d1000006", index),
          name: `${demoPrefix} Competitor ${suffix}`,
          contactPerson: `Competitor Contact ${suffix}`,
          contactNumber: `011100${suffix}`,
          email: `competitor${suffix}@example.invalid`,
          province: "Western",
          district: "Colombo",
          notes: "Synthetic TQMS test data",
        },
        update: { name: `${demoPrefix} Competitor ${suffix}`, active: true },
      });
      const institution = await transaction.institution.upsert({
        where: { id: id("d1000007", index) },
        create: {
          id: id("d1000007", index),
          name: `${demoPrefix} Institution ${suffix}`,
          address: `Demo institution address ${suffix}`,
          province: "Western",
          district: "Colombo",
          contactNumber1: `011200${suffix}`,
          contactPerson: `Institution Contact ${suffix}`,
        },
        update: { name: `${demoPrefix} Institution ${suffix}` },
      });
      const registration = await transaction.registration.upsert({
        where: { id: id("d1000008", index) },
        create: {
          id: id("d1000008", index),
          institutionId: institution.id,
          year: 2026 + Math.floor((index - 1) / 10),
          registrationFee: 10000 + index * 100,
          bondAmount: 5000 + index * 50,
          registrationDate: demoDate(-30),
          expiryDate: demoDate(330 + index),
          notes: `${demoPrefix} registration ${suffix}`,
        },
        update: {
          institutionId: institution.id,
          year: 2026 + Math.floor((index - 1) / 10),
          registrationFee: 10000 + index * 100,
          bondAmount: 5000 + index * 50,
          registrationDate: demoDate(-30),
          expiryDate: demoDate(330 + index),
        },
      });
      await transaction.registrationItem.upsert({
        where: { registrationId_itemId: { registrationId: registration.id, itemId: item.id } },
        create: { registrationId: registration.id, itemId: item.id },
        update: {},
      });
      const payment = await transaction.registrationPayment.upsert({
        where: { id: id("d1000009", index) },
        create: {
          id: id("d1000009", index),
          registrationId: registration.id,
          mode: index % 2 ? "BANK_TRANSFER" : "CHEQUE",
          amount: 10000 + index * 100,
          paymentDate: demoDate(-20),
          reference: `${demoPrefix}-PAY-${suffix}`,
          bank: index % 2 ? "Demo Bank" : null,
          paidBy: admin.fullName,
        },
        update: {
          registrationId: registration.id,
          amount: 10000 + index * 100,
          paymentDate: demoDate(-20),
        },
      });
      await transaction.registrationPaymentDocument.upsert({
        where: { paymentId_type: { paymentId: payment.id, type: "RECEIPT_COPY" } },
        create: {
          id: id("d1000010", index),
          paymentId: payment.id,
          type: "RECEIPT_COPY",
          fileName: `${demoPrefix.replaceAll(" ", "-")}-receipt-${suffix}.pdf`,
          contentType: "application/pdf",
          data: Uint8Array.from(minimalPdf()),
        },
        update: {
          fileName: `${demoPrefix.replaceAll(" ", "-")}-receipt-${suffix}.pdf`,
          contentType: "application/pdf",
          data: Uint8Array.from(minimalPdf()),
        },
      });

      const caseIndex = (index - 1) % statuses.length;
      const tenderStatus = statuses[caseIndex];
      const closingAt = demoDate(caseIndex < 3 ? 15 + index : -60 - index);
      const tender = await transaction.tender.upsert({
        where: { id: id("d1000011", index) },
        create: {
          id: id("d1000011", index),
          referenceNumber: `${demoPrefix.replaceAll(" ", "-")}-TENDER-${suffix}`,
          type: tenderTypes[index % tenderTypes.length],
          status: tenderStatus,
          institutionId: institution.id,
          source: "Synthetic demo data",
          contactOfficer: `Tender Contact ${suffix}`,
          closingAt,
          province: "Western",
          district: "Colombo",
          responsibleRepId: admin.id,
          bidBondRequired: index % 2 === 0,
          bidBondAmount: index % 2 === 0 ? 25000 + index * 100 : null,
          bidBondBank: index % 2 === 0 ? "Demo Bank" : null,
          bidBondNumber: index % 2 === 0 ? `${demoPrefix}-BOND-${suffix}` : null,
          bidBondIssueDate: index % 2 === 0 ? demoDate(-70) : null,
          bidBondExpiryDate: index % 2 === 0 ? demoDate(30) : null,
          bidBondStatus: index % 2 === 0 ? "ISSUED" : null,
          notes: `${demoPrefix} scenario ${suffix}`,
        },
        update: {
          referenceNumber: `${demoPrefix.replaceAll(" ", "-")}-TENDER-${suffix}`,
          status: tenderStatus,
          institutionId: institution.id,
          closingAt,
          responsibleRepId: admin.id,
          notes: `${demoPrefix} scenario ${suffix}`,
        },
      });
      const tenderItem = await transaction.tenderItem.upsert({
        where: { id: id("d1000012", index) },
        create: {
          id: id("d1000012", index),
          tenderId: tender.id,
          itemId: item.id,
          description: item.name,
          specification: item.modelSpecification,
          quantity: 1 + index,
          unit: unit.name,
          estimatedUnitPrice: 20000 + index * 1000,
        },
        update: {
          tenderId: tender.id,
          itemId: item.id,
          description: item.name,
          specification: item.modelSpecification,
          quantity: 1 + index,
          unit: unit.name,
        },
      });
      const supplierPrice = await transaction.supplierPrice.upsert({
        where: { id: id("d1000013", index) },
        create: {
          id: id("d1000013", index),
          tenderItemId: tenderItem.id,
          supplierId: supplier.id,
          supplierName: supplier.name,
          unitPrice: 15000 + index * 500,
          requestedById: admin.id,
          givenBy: `Supplier Contact ${suffix}`,
          receivedAt: demoDate(-10),
          validUntil: demoDate(180),
          notes: `${demoPrefix} supplier price`,
        },
        update: {
          tenderItemId: tenderItem.id,
          supplierId: supplier.id,
          supplierName: supplier.name,
          unitPrice: 15000 + index * 500,
          requestedById: admin.id,
          validUntil: demoDate(180),
        },
      });
      const quotationStatus = quotationStatuses[caseIndex];
      const submittedAt = ["PENDING_TENDER_MANAGER", "PENDING_DIRECTOR", "APPROVED"].includes(quotationStatus)
        ? demoDate(-15)
        : null;
      const quotation = await transaction.quotation.upsert({
        where: { id: id("d1000014", index) },
        create: {
          id: id("d1000014", index),
          tenderId: tender.id,
          version: 1,
          status: quotationStatus,
          validityDays: 30,
          vatRate: 15,
          discountAmount: 0,
          subtotal: (22000 + index * 700) * (1 + index),
          vatAmount: (22000 + index * 700) * (1 + index) * 0.15,
          totalAmount: (22000 + index * 700) * (1 + index) * 1.15,
          grossProfit: (22000 + index * 700 - (15000 + index * 500)) * (1 + index),
          terms: `${demoPrefix} quotation terms`,
          createdById: admin.id,
          managerApprovedById: ["PENDING_DIRECTOR", "APPROVED"].includes(quotationStatus) ? admin.id : null,
          managerApprovedAt: ["PENDING_DIRECTOR", "APPROVED"].includes(quotationStatus) ? demoDate(-14) : null,
          directorApprovedById: quotationStatus === "APPROVED" ? admin.id : null,
          directorApprovedAt: quotationStatus === "APPROVED" ? demoDate(-13) : null,
          rejectionReason: quotationStatus === "REJECTED" ? `${demoPrefix} sample rejection` : null,
          submittedForApprovalAt: submittedAt,
        },
        update: {
          tenderId: tender.id,
          status: quotationStatus,
          subtotal: (22000 + index * 700) * (1 + index),
          vatAmount: (22000 + index * 700) * (1 + index) * 0.15,
          totalAmount: (22000 + index * 700) * (1 + index) * 1.15,
          grossProfit: (22000 + index * 700 - (15000 + index * 500)) * (1 + index),
          managerApprovedById: ["PENDING_DIRECTOR", "APPROVED"].includes(quotationStatus) ? admin.id : null,
          managerApprovedAt: ["PENDING_DIRECTOR", "APPROVED"].includes(quotationStatus) ? demoDate(-14) : null,
          directorApprovedById: quotationStatus === "APPROVED" ? admin.id : null,
          directorApprovedAt: quotationStatus === "APPROVED" ? demoDate(-13) : null,
          rejectionReason: quotationStatus === "REJECTED" ? `${demoPrefix} sample rejection` : null,
          submittedForApprovalAt: submittedAt,
        },
      });
      await transaction.quotationLine.upsert({
        where: { id: id("d1000015", index) },
        create: {
          id: id("d1000015", index),
          quotationId: quotation.id,
          tenderItemId: tenderItem.id,
          pricingMethod: "PERCENTAGE",
          costBaseMethod: "LOWEST",
          supplierPriceId: supplierPrice.id,
          baseUnitCost: 15000 + index * 500,
          marginPercent: 40,
          quantity: 1 + index,
          sellingUnitPrice: 22000 + index * 700,
          lineSubtotal: (22000 + index * 700) * (1 + index),
          grossProfit: (22000 + index * 700 - (15000 + index * 500)) * (1 + index),
        },
        update: {
          quotationId: quotation.id,
          tenderItemId: tenderItem.id,
          supplierPriceId: supplierPrice.id,
          quantity: 1 + index,
        },
      });

      const reading = await transaction.tenderReading.upsert({
        where: { id: id("d1000016", index) },
        create: {
          id: id("d1000016", index),
          tenderId: tender.id,
          readingDate: demoDate(-12),
          method: index % 2 ? "CALL" : "VISIT",
          reportedById: admin.id,
          notes: `${demoPrefix} tender reading`,
        },
        update: { tenderId: tender.id, reportedById: admin.id, readingDate: demoDate(-12) },
      });
      for (const [bidIndex, isOurCompany] of [true, false].entries()) {
        const bidId = id("d1000017", index * 2 - 1 + bidIndex);
        const bid = await transaction.readingBid.upsert({
          where: { id: bidId },
          create: {
            id: bidId,
            readingId: reading.id,
            competitorId: isOurCompany ? null : competitor.id,
            companyName: isOurCompany ? "TQMS Demo Company" : competitor.name,
            isOurCompany,
            totalPrice: (isOurCompany ? 22000 : 23500) * (1 + index),
          },
          update: {
            readingId: reading.id,
            competitorId: isOurCompany ? null : competitor.id,
            companyName: isOurCompany ? "TQMS Demo Company" : competitor.name,
            isOurCompany,
            totalPrice: (isOurCompany ? 22000 : 23500) * (1 + index),
          },
        });
        await transaction.readingBidLine.upsert({
          where: { id: id("d1000018", index * 2 - 1 + bidIndex) },
          create: {
            id: id("d1000018", index * 2 - 1 + bidIndex),
            readingBidId: bid.id,
            tenderItemId: tenderItem.id,
            unitPrice: isOurCompany ? 22000 : 23500,
          },
          update: { readingBidId: bid.id, tenderItemId: tenderItem.id, unitPrice: isOurCompany ? 22000 : 23500 },
        });
        await transaction.readingBidHistory.upsert({
          where: { id: id("d1000019", index * 2 - 1 + bidIndex) },
          create: {
            id: id("d1000019", index * 2 - 1 + bidIndex),
            readingBidId: bid.id,
            editedById: admin.id,
            previousData: {
              companyName: isOurCompany ? "TQMS Demo Company" : competitor.name,
              isOurCompany,
              totalPrice: 0,
              lines: [],
            },
            changedAt: demoDate(-11),
          },
          update: {
            readingBidId: bid.id,
            editedById: admin.id,
            previousData: {
              companyName: isOurCompany ? "TQMS Demo Company" : competitor.name,
              isOurCompany,
              totalPrice: 0,
              lines: [],
            },
          },
        });
      }

      await transaction.pricePredictionRun.upsert({
        where: { id: id("d1000020", index) },
        create: {
          id: id("d1000020", index),
          tenderId: tender.id,
          tenderItemId: tenderItem.id,
          requestedById: admin.id,
          status: "READY",
          modelVersion: "demo-v1",
          totalReadingCount: 20,
          winningSampleCount: 8,
          competitorSampleCount: 12,
          targetWinProbability: 0.6,
          chosenBidPrice: 22000 + index * 700,
          chosenWinProbability: 0.65,
          predictedLow: 21000 + index * 600,
          predictedMostLikely: 22000 + index * 700,
          predictedHigh: 24000 + index * 800,
          recommendedBidPrice: 22000 + index * 700,
          currentUnitCost: 15000 + index * 500,
          expectedGrossProfit: (22000 + index * 700 - (15000 + index * 500)) * (1 + index),
          supportTenderIds: [],
        },
        update: { tenderId: tender.id, tenderItemId: tenderItem.id, requestedById: admin.id, status: "READY" },
      });
      await transaction.tenderExpectedBidder.upsert({
        where: { tenderId_competitorId: { tenderId: tender.id, competitorId: competitor.id } },
        create: { tenderId: tender.id, competitorId: competitor.id },
        update: {},
      });

      const hasAward = caseIndex >= 5 && caseIndex <= 8;
      let awardId: string | null = null;
      if (hasAward) {
        awardId = id("d1000021", index);
        const wonByUs = caseIndex !== 6;
        const award = await transaction.tenderAward.upsert({
          where: { id: awardId },
          create: {
            id: awardId,
            tenderId: tender.id,
            type: "WHOLE",
            awardedAt: demoDate(-8),
            reason: `${demoPrefix} award result`,
          },
          update: { tenderId: tender.id, type: "WHOLE", awardedAt: demoDate(-8) },
        });
        await transaction.tenderAwardLine.upsert({
          where: { id: id("d1000022", index) },
          create: {
            id: id("d1000022", index),
            awardId: award.id,
            tenderItemId: tenderItem.id,
            winnerCompetitorId: wonByUs ? null : competitor.id,
            winnerName: wonByUs ? "TQMS Demo Company" : competitor.name,
            wonByUs,
            quantity: 1 + index,
            unitPrice: wonByUs ? 22000 + index * 700 : 23500,
            lossReason: wonByUs ? null : "Demo competitor offered lower price",
          },
          update: {
            awardId: award.id,
            tenderItemId: tenderItem.id,
            winnerCompetitorId: wonByUs ? null : competitor.id,
            winnerName: wonByUs ? "TQMS Demo Company" : competitor.name,
            wonByUs,
          },
        });
        if (caseIndex === 7 || caseIndex === 8) {
          await transaction.purchaseOrder.upsert({
            where: { id: id("d1000023", index) },
            create: {
              id: id("d1000023", index),
              tenderId: tender.id,
              quotationId: quotation.id,
              poNumber: `${demoPrefix.replaceAll(" ", "-")}-PO-${suffix}`,
              poDate: demoDate(-5),
              deliveryDate: caseIndex === 8 ? demoDate(-2) : null,
              terms: `${demoPrefix} purchase order`,
              paymentTerms: "30 days",
              deliveryStatus: caseIndex === 8 ? "DELIVERED" : "PENDING",
              invoiceNumber: caseIndex === 8 ? `${demoPrefix}-INV-${suffix}` : null,
              paymentReceived: caseIndex === 8,
              performanceBondStatus: "NOT_REQUIRED",
            },
            update: {
              tenderId: tender.id,
              quotationId: quotation.id,
              deliveryStatus: caseIndex === 8 ? "DELIVERED" : "PENDING",
              paymentReceived: caseIndex === 8,
            },
          });
          await transaction.purchaseOrderLine.upsert({
            where: { id: id("d1000024", index) },
            create: {
              id: id("d1000024", index),
              purchaseOrderId: id("d1000023", index),
              tenderItemId: tenderItem.id,
              quantity: 1 + index,
              unitPrice: 22000 + index * 700,
            },
            update: {
              purchaseOrderId: id("d1000023", index),
              tenderItemId: tenderItem.id,
              quantity: 1 + index,
            },
          });
        }
      }

      await transaction.auditLog.upsert({
        where: { id: id("d1000025", index) },
        create: {
          id: id("d1000025", index),
          actorId: admin.id,
          action: "DEMO_SEED",
          entityType: "Tender",
          entityId: tender.id,
          metadata: { source: demoPrefix, scenario: suffix, awardId },
        },
        update: { actorId: admin.id, entityId: tender.id, metadata: { source: demoPrefix, scenario: suffix, awardId } },
      });
      await transaction.notification.upsert({
        where: {
          type_referenceId_leadDays: {
            type: "DEMO_TEST_RECORD",
            referenceId: tender.id,
            leadDays: index,
          },
        },
        create: {
          type: "DEMO_TEST_RECORD",
          title: `${demoPrefix} scenario ${suffix}`,
          message: `Synthetic sample for ${tender.referenceNumber}; tender status: ${tenderStatus}.`,
          referenceId: tender.id,
          leadDays: index,
        },
        update: { title: `${demoPrefix} scenario ${suffix}`, message: `Synthetic sample for ${tender.referenceNumber}; tender status: ${tenderStatus}.` },
      });
    }

    console.info(`Using Administrator ${admin.fullName} for demo audit and ownership records.`);
  }, { timeout: 60_000 });
  console.info(`Seeded 20 linked ${demoPrefix.toLowerCase()} scenarios.`);
  console.info("Related item, registration, payment, tender, pricing, quotation, reading, prediction, award, order, audit, and notification records are included.");
}

seedDemoData()
  .catch((error: unknown) => {
    console.error("Demo data seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
