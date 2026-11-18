import nodemailer from "nodemailer";
import type { Role } from "@prisma/client";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { colomboDayDifference, colomboDayStart } from "./colombo-date.js";

const DAY_MS = 86_400_000;
const reminderDays = [60, 30, 14, 7, 3, 1, 0];
const notificationPermissionCache = new Map<string, boolean>();

function formatColomboDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" });
}

async function usersForRoles(roles: Role[]) {
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: roles } },
    select: {
      id: true,
      email: true,
      fullName: true,
      customRole: { select: { permissions: true } },
    },
  });
  return users
    .filter(({ customRole }) => !customRole ||
      Array.isArray(customRole.permissions) && customRole.permissions.includes("notifications.view"))
    .map(({ id, email, fullName }) => ({ id, email, fullName }));
}

async function notifyUsers(
  recipients: Array<{ id: string }>,
  notice: { type: string; title: string; message: string; referenceId: string; leadDays: number },
) {
  const recipientIds = [...new Set(recipients.map(({ id }) => id))];
  const missingIds = recipientIds.filter((id) => !notificationPermissionCache.has(id));
  if (missingIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: missingIds }, active: true },
      select: { id: true, customRole: { select: { permissions: true } } },
    });
    const activeIds = new Set(users.map(({ id }) => id));
    for (const id of missingIds) {
      const user = users.find((candidate) => candidate.id === id);
      notificationPermissionCache.set(id, Boolean(
        user && (!user.customRole ||
          Array.isArray(user.customRole.permissions) && user.customRole.permissions.includes("notifications.view")),
      ));
    }
    for (const id of recipientIds.filter((candidate) => !activeIds.has(candidate))) {
      notificationPermissionCache.set(id, false);
    }
  }
  for (const recipientId of recipientIds.filter((id) => notificationPermissionCache.get(id))) {
    await prisma.notification.upsert({
      where: {
        type_referenceId_leadDays_recipientId: {
          type: notice.type,
          referenceId: notice.referenceId,
          leadDays: notice.leadDays,
          recipientId,
        },
      },
      create: { ...notice, recipientId },
      update: {},
    });
  }
}

async function sendPendingEmails() {
  if (!config.SMTP_HOST || !config.SMTP_FROM) return;

  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  });
  try {
    const now = new Date();
    const pending = await prisma.notification.findMany({
      where: {
        recipientId: { not: null },
        emailSentAt: null,
        acknowledgedAt: null,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      include: { recipient: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    for (const notice of pending) {
      if (!notice.recipient) continue;
      try {
        await transport.sendMail({
          from: config.SMTP_FROM,
          to: notice.recipient.email,
          subject: notice.title,
          text: notice.message,
        });
        await prisma.notification.updateMany({
          where: { id: notice.id, emailSentAt: null },
          data: { emailSentAt: new Date() },
        });
      } catch (error) {
        console.error(`Failed to email notification ${notice.id} to ${notice.recipient.email}`, error);
      }
    }
  } finally {
    transport.close();
  }
}

async function createTenderClosingNotifications(now: Date, managers: Array<{ id: string }>) {
  const today = colomboDayStart(now);
  const windowEnd = new Date(today.getTime() + 8 * DAY_MS);
  const tenders = await prisma.tender.findMany({
    where: {
      closingAt: { gte: today, lt: windowEnd },
      status: { notIn: ["SUBMITTED", "CANCELLED"] },
    },
    include: {
      institution: { select: { name: true } },
      responsibleRep: { select: { id: true, fullName: true } },
    },
  });
  for (const tender of tenders) {
    const remaining = colomboDayDifference(tender.closingAt, now);
    if (![7, 3, 1, 0].includes(remaining)) continue;
    await notifyUsers(
      [...managers, tender.responsibleRep],
      {
        type: "TENDER_CLOSING",
        title: remaining === 0 ? "Tender closes today" : `Tender closes in ${remaining} days`,
        message: `${tender.referenceNumber} for ${tender.institution.name} closes on ${formatColomboDate(tender.closingAt)}. Responsible rep: ${tender.responsibleRep.fullName}.`,
        referenceId: tender.id,
        leadDays: remaining,
      },
    );
  }
}

async function createRegistrationExpiryNotifications(now: Date, recipients: Array<{ id: string }>) {
  const today = colomboDayStart(now);
  const registrations = await prisma.registration.findMany({
    where: {
      expiryDate: { lte: new Date(today.getTime() + 60 * DAY_MS) },
      renewals: { none: {} },
    },
    include: { institution: { select: { name: true } } },
  });
  for (const registration of registrations) {
    const remaining = colomboDayDifference(registration.expiryDate, now);
    if (remaining > 0 && !reminderDays.includes(remaining)) continue;
    const expired = remaining < 0;
    await notifyUsers(recipients, {
      type: expired ? "REGISTRATION_EXPIRED" : "REGISTRATION_EXPIRY",
      title: expired ? "Registration expired" : remaining === 0 ? "Registration expires today" : `Registration expires in ${remaining} days`,
      message: expired
        ? `${registration.institution.name} registration expired ${Math.abs(remaining)} day(s) ago.`
        : `${registration.institution.name} registration expires on ${formatColomboDate(registration.expiryDate)}.`,
      referenceId: registration.id,
      leadDays: remaining,
    });
  }
}

async function createBondExpiryNotifications(now: Date, recipients: Array<{ id: string }>) {
  const today = colomboDayStart(now);
  const limit = new Date(today.getTime() + 60 * DAY_MS);
  const tenders = await prisma.tender.findMany({
    where: {
      bidBondRequired: true,
      bidBondExpiryDate: { not: null, lte: limit },
      OR: [{ bidBondStatus: null }, { bidBondStatus: { in: ["REQUESTED", "ISSUED", "SUBMITTED"] } }],
    },
    include: { responsibleRep: { select: { id: true } } },
  });
  for (const tender of tenders) {
    if (!tender.bidBondExpiryDate) continue;
    const remaining = colomboDayDifference(tender.bidBondExpiryDate, now);
    if (remaining > 0 && !reminderDays.includes(remaining)) continue;
    const expired = remaining < 0;
    await notifyUsers([...recipients, tender.responsibleRep], {
      type: expired ? "BID_BOND_EXPIRED" : "BID_BOND_EXPIRY",
      title: expired ? "Bid bond expired" : remaining === 0 ? "Bid bond expires today" : `Bid bond expires in ${remaining} days`,
      message: `Bid bond for tender ${tender.referenceNumber} ${expired ? `expired ${Math.abs(remaining)} day(s) ago` : `expires on ${formatColomboDate(tender.bidBondExpiryDate)}`}.`,
      referenceId: tender.id,
      leadDays: remaining,
    });
  }

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      performanceBondRequired: true,
      performanceBondExpiryDate: { not: null, lte: limit },
      performanceBondStatus: { in: ["REQUESTED", "ISSUED", "SUBMITTED"] },
    },
    include: { tender: { select: { referenceNumber: true, responsibleRep: { select: { id: true } } } } },
  });
  for (const order of purchaseOrders) {
    if (!order.performanceBondExpiryDate) continue;
    const remaining = colomboDayDifference(order.performanceBondExpiryDate, now);
    if (remaining > 0 && !reminderDays.includes(remaining)) continue;
    const expired = remaining < 0;
    await notifyUsers([...recipients, order.tender.responsibleRep], {
      type: expired ? "PERFORMANCE_BOND_EXPIRED" : "PERFORMANCE_BOND_EXPIRY",
      title: expired ? "Performance bond expired" : remaining === 0 ? "Performance bond expires today" : `Performance bond expires in ${remaining} days`,
      message: `Performance bond for PO ${order.poNumber} (tender ${order.tender.referenceNumber}) ${expired ? `expired ${Math.abs(remaining)} day(s) ago` : `expires on ${formatColomboDate(order.performanceBondExpiryDate)}`}.`,
      referenceId: order.id,
      leadDays: remaining,
    });
  }
}

async function createSupplierPriceExpiryNotifications(now: Date, recipients: Array<{ id: string }>) {
  const today = colomboDayStart(now);
  const prices = await prisma.supplierPrice.findMany({
    where: { validUntil: { not: null, lte: new Date(today.getTime() + 7 * DAY_MS) } },
    include: {
      requestedBy: { select: { id: true } },
      tenderItem: { select: { description: true, tender: { select: { referenceNumber: true } } } },
    },
  });
  for (const price of prices) {
    if (!price.validUntil) continue;
    const remaining = colomboDayDifference(price.validUntil, now);
    if (remaining > 0 && ![7, 3, 1, 0].includes(remaining)) continue;
    const expired = remaining < 0;
    await notifyUsers([...recipients, price.requestedBy], {
      type: expired ? "SUPPLIER_PRICE_EXPIRED" : "SUPPLIER_PRICE_EXPIRY",
      title: expired ? "Supplier price expired" : remaining === 0 ? "Supplier price expires today" : `Supplier price expires in ${remaining} days`,
      message: `Supplier price for ${price.tenderItem.description} on tender ${price.tenderItem.tender.referenceNumber} ${expired ? `expired ${Math.abs(remaining)} day(s) ago` : `expires on ${formatColomboDate(price.validUntil)}`}.`,
      referenceId: price.id,
      leadDays: remaining,
    });
  }
}

async function createApprovalAndReadingNotifications(now: Date, managers: Array<{ id: string }>, directors: Array<{ id: string }>) {
  const quotations = await prisma.quotation.findMany({
    where: { status: { in: ["PENDING_TENDER_MANAGER", "PENDING_DIRECTOR"] } },
    include: { tender: { select: { referenceNumber: true, responsibleRep: { select: { id: true } } } } },
  });
  for (const quotation of quotations) {
    const managerApproval = quotation.status === "PENDING_TENDER_MANAGER";
    await notifyUsers(managerApproval ? managers : directors, {
      type: managerApproval ? "QUOTATION_PENDING_MANAGER" : "QUOTATION_PENDING_DIRECTOR",
      title: managerApproval ? "Quotation awaiting manager approval" : "Quotation awaiting director approval",
      message: `Quotation ${quotation.version} for tender ${quotation.tender.referenceNumber} is awaiting approval.`,
      referenceId: quotation.id,
      leadDays: 0,
    });
  }

  const overdueTenders = await prisma.tender.findMany({
    where: {
      status: "SUBMITTED",
      closingAt: { lt: colomboDayStart(now) },
      readings: { none: {} },
    },
    include: { responsibleRep: { select: { id: true } } },
  });
  for (const tender of overdueTenders) {
    await notifyUsers([...managers, tender.responsibleRep], {
      type: "TENDER_READING_OVERDUE",
      title: "Tender result reading overdue",
      message: `No result reading has been recorded for tender ${tender.referenceNumber}, which closed on ${formatColomboDate(tender.closingAt)}.`,
      referenceId: tender.id,
      leadDays: 0,
    });
  }
}

export async function runNotificationJobs(now = new Date()): Promise<void> {
  notificationPermissionCache.clear();
  const [managers, directors, registrationRecipients, bondRecipients, priceRecipients] = await Promise.all([
    usersForRoles(["ADMIN", "TENDER_MANAGER"]),
    usersForRoles(["ADMIN", "DIRECTOR"]),
    usersForRoles(["ADMIN", "ACCOUNTS", "COSTING"]),
    usersForRoles(["ADMIN", "ACCOUNTS", "TENDER_MANAGER"]),
    usersForRoles(["ADMIN", "COSTING"]),
  ]);
  const jobs = await Promise.allSettled([
    createTenderClosingNotifications(now, managers),
    createRegistrationExpiryNotifications(now, registrationRecipients),
    createBondExpiryNotifications(now, bondRecipients),
    createSupplierPriceExpiryNotifications(now, priceRecipients),
    createApprovalAndReadingNotifications(now, managers, directors),
  ]);
  for (const result of jobs) {
    if (result.status === "rejected") console.error("Failed to refresh a notification category", result.reason);
  }
  await sendPendingEmails();
}
