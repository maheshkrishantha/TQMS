import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Prisma, TenderStatus } from "@prisma/client";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import {
  allowRoles,
  clearSession,
  issueSession,
  requireAuth,
  requireCsrf,
  type AuthUser,
} from "./auth.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { isSriLankaBankCode, sriLankaBanks } from "./banks.js";
import { baseRolePermissions, hasPermission, permissionCatalog } from "./permissions.js";
import { sriLankaAreas } from "./areas.js";
import { colomboDayStart } from "./colombo-date.js";
import { tenderAccessFilter } from "./tender-access.js";
import {
  areWonAwardQuantitiesOrdered,
  canRecordAward,
  hasCompleteAwardCoverage,
  isPreSubmissionStatus,
} from "./tender-workflow.js";
import {
  buildMasterNameLookup,
  itemImportSchema,
  itemSchema,
  normalizeMasterName,
} from "./item-schema.js";

const app = express();
const defaultJsonParser = express.json({ limit: "1mb" });
const itemImportJsonParser = express.json({ limit: "10mb" });
const supportedDocumentMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const businessDocumentUpload = express.raw({ type: [...supportedDocumentMimeTypes], limit: "20mb" });
const adminOnly: express.RequestHandler = (request, response, next) => {
  if (request.user?.role !== "ADMIN" || request.user.customRoleId) {
    response.status(403).json({ error: "Administrator access is required" });
    return;
  }
  next();
};
const managerRoles = allowRoles("ADMIN", "TENDER_MANAGER");
const itemEditorRoles = allowRoles("ADMIN", "COSTING");
const registrationRoles = allowRoles("ADMIN", "COSTING", "ACCOUNTS");
const tenderReaderRoles = allowRoles("ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS");
const tenderEditorRoles = allowRoles("ADMIN", "TENDER_MANAGER", "SALES_REP");
const resultsEditorRoles = allowRoles("ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS");
const supplierPriceRoles = allowRoles("ADMIN", "DIRECTOR", "TENDER_MANAGER", "COSTING");
const quotationRoles = allowRoles("ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP");
const quotationApproverRoles = allowRoles("ADMIN", "DIRECTOR", "TENDER_MANAGER");
const predictionRoles = allowRoles("ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING");

function canViewPricingCosts(user: AuthUser): boolean {
  return hasPermission(user.role, user.permissions, "pricingCosts.view");
}

app.disable("x-powered-by");
if (config.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: config.CLIENT_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token"],
}));
app.use((request, response, next) => {
  const parser = request.method === "POST" && request.path === "/api/items/import"
    ? itemImportJsonParser
    : defaultJsonParser;
  parser(request, response, next);
});
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (request) => {
    const email = typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase().slice(0, 254)
      : "";
    return `${ipKeyGenerator(request.ip ?? "unknown")}:${email}`;
  },
  handler: (_request, response) => {
    response.status(429).json({ error: "Too many unsuccessful sign-in attempts for this account. Wait 15 minutes and try again." });
  },
});

type Handler = (
  request: express.Request,
  response: express.Response,
  next: express.NextFunction,
) => void | Promise<void>;

function route(handler: Handler): express.RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

async function writeAudit(
  transaction: Prisma.TransactionClient,
  actorId: string | undefined,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Prisma.InputJsonObject,
) {
  await transaction.auditLog.create({
    data: { actorId, action, entityType, entityId, metadata },
  });
}

function paramId(request: express.Request, name = "id"): string {
  return z.string().uuid().parse(request.params[name]);
}

function paramMasterId(request: express.Request): string {
  return z.string().min(1).max(100).parse(request.params.id);
}

function validDocumentContent(data: Buffer, contentType: string): boolean {
  if (contentType === "application/pdf") return data.subarray(0, 5).toString("ascii") === "%PDF-";
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/png") return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function documentFileName(value: unknown): string {
  const rawFileName = z.string().min(1).max(255).parse(value);
  const fileName = rawFileName.replace(/\\/g, "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!fileName) throw new RequestValidationError("A valid file name is required");
  return fileName.slice(0, 180);
}

function validatedDocumentData(request: express.Request, contentType: string): Uint8Array<ArrayBuffer> {
  if (!supportedDocumentMimeTypes.includes(contentType as (typeof supportedDocumentMimeTypes)[number])) {
    throw new RequestValidationError("Upload a PDF, JPEG, PNG, or WebP document");
  }
  if (!Buffer.isBuffer(request.body) || request.body.length === 0 || !validDocumentContent(request.body, contentType)) {
    throw new RequestValidationError("The uploaded file is empty or does not match its file type");
  }
  return new Uint8Array(request.body);
}

function sendDocument(
  response: express.Response,
  document: { fileName: string; contentType: string; data: Uint8Array<ArrayBuffer> },
): void {
  response.set({
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    "Content-Type": document.contentType,
    "X-Content-Type-Options": "nosniff",
  });
  response.send(document.data);
}

const userView = (user: {
  id: string;
  email: string;
  fullName: string;
  role: AuthUser["role"];
  active: boolean;
  customRoleId?: string | null;
  customRole?: { name: string; baseRole: AuthUser["role"]; permissions: Prisma.JsonValue } | null;
  areaAssignments?: { province: string; district: string }[];
}) => {
  const role = user.customRole?.baseRole ?? user.role;
  const permissions = Array.isArray(user.customRole?.permissions)
    ? user.customRole.permissions.filter((permission): permission is string => typeof permission === "string")
    : user.customRole ? [] : baseRolePermissions[role];
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role,
    active: user.active,
    customRoleId: user.customRoleId ?? null,
    customRoleName: user.customRole?.name ?? null,
    permissions,
    areaAssignments: (user.areaAssignments ?? []).map(({ province, district }) => ({
      province,
      district: district || null,
    })),
  };
};

class RequestValidationError extends Error {}

function validateAreaAssignments(
  assignments: { province: string; district: string }[],
  role: AuthUser["role"],
): { province: string; district: string }[] {
  if (assignments.length && role !== "SALES_REP") {
    throw new RequestValidationError("Area assignments are only available for Sales Rep users.");
  }
  const unique = new Map<string, { province: string; district: string }>();
  for (const assignment of assignments) {
    const province = sriLankaAreas.find((area) => area.province === assignment.province);
    if (!province || assignment.district && !province.districts.includes(assignment.district)) {
      throw new RequestValidationError("Select a valid province and district for every assigned area.");
    }
    unique.set(`${province.province}\u0000${assignment.district}`, {
      province: province.province,
      district: assignment.district,
    });
  }
  const areas = [...unique.values()];
  const wholeProvinceAssignments = new Set(areas.filter((area) => !area.district).map((area) => area.province));
  return areas.filter((area) => !area.district || !wholeProvinceAssignments.has(area.province));
}

async function validateItemOptions(
  transaction: Prisma.TransactionClient,
  input: { categoryId?: string | null; brandId?: string | null; unitId: string },
  previous?: { categoryId: string | null; brandId: string | null; unitId: string },
): Promise<void> {
  const [category, brand, unit] = await Promise.all([
    input.categoryId
      ? transaction.itemCategory.findFirst({
          where: {
            id: input.categoryId,
            OR: [{ active: true }, ...(previous?.categoryId === input.categoryId ? [{ active: false }] : [])],
          },
        })
      : null,
    input.brandId
      ? transaction.brand.findFirst({
          where: {
            id: input.brandId,
            OR: [{ active: true }, ...(previous?.brandId === input.brandId ? [{ active: false }] : [])],
          },
        })
      : null,
    transaction.unit.findFirst({
      where: {
        id: input.unitId,
        OR: [{ active: true }, ...(previous?.unitId === input.unitId ? [{ active: false }] : [])],
      },
    }),
  ]);
  if ((input.categoryId && !category) || (input.brandId && !brand) || !unit) {
    throw new RequestValidationError("Select active category, brand, and unit values from the item master.");
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isSupplierPriceCurrent(validUntil: Date | null): boolean {
  if (!validUntil) return true;
  const offsetMs = 330 * 60 * 1000;
  const validThrough = new Date(validUntil.getTime() + offsetMs).toISOString().slice(0, 10);
  const today = new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
  return validThrough >= today;
}

async function findAccessibleTender(id: string, user: AuthUser) {
  const access = await tenderAccessWhere(user);
  return prisma.tender.findFirst({
    where: { id, ...access },
    include: { items: { select: { id: true, quantity: true } } },
  });
}

async function tenderAccessWhere(user: AuthUser): Promise<Prisma.TenderWhereInput> {
  if (user.role !== "SALES_REP") return {};
  const assignments = await prisma.userAreaAssignment.findMany({
    where: { userId: user.id },
    select: { province: true, district: true },
  });
  return tenderAccessFilter(user, assignments);
}
function pricePercentile(prices: number[], percentile: number): number | null {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentile * sorted.length) - 1));
  return roundMoney(sorted[index]);
}

function priceWinProbability(competitorLowestPrices: number[], chosenPrice: number | null): number | null {
  if (!competitorLowestPrices.length || chosenPrice === null) return null;
  const beating = competitorLowestPrices.filter((price) => price > chosenPrice).length;
  const tied = competitorLowestPrices.filter((price) => price === chosenPrice).length;
  return Math.round((beating + tied * 0.5) / competitorLowestPrices.length * 10000) / 10000;
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get(
  "/api/ready",
  route(async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: "ready" });
  }),
);

app.get(
  "/api/areas",
  requireAuth,
  (_request, response) => {
    response.json(sriLankaAreas);
  },
);

app.post(
  "/api/auth/login",
  loginLimiter,
  route(async (request, response) => {
    const body = z.object({
      email: z.string().email().transform((email) => email.toLowerCase()),
      password: z.string().min(1),
    }).parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { customRole: true },
    });
    if (!user?.active || !(await bcrypt.compare(body.password, user.passwordHash))) {
      response.status(401).json({ error: "Email or password is incorrect" });
      return;
    }
    const safeUser = userView(user);
    const csrfToken = issueSession(safeUser, user.sessionVersion, response);
    response.json({ user: safeUser, csrfToken });
  }),
);

app.get(
  "/api/banks",
  requireAuth,
  route(async (_request, response) => {
    response.json(sriLankaBanks);
  }),
);

app.get(
  "/api/auth/session",
  requireAuth,
  route(async (request, response) => {
    response.json({ user: request.user, csrfToken: request.csrfToken });
  }),
);

app.post(
  "/api/auth/logout",
  requireAuth,
  requireCsrf,
  (_request, response) => {
    clearSession(response);
    response.status(204).end();
  },
);

app.post(
  "/api/auth/password",
  requireAuth,
  requireCsrf,
  route(async (request, response) => {
    const actorId = request.user?.id;
    if (!actorId) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    const input = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(12).max(200),
    }).parse(request.body);
    const currentUser = await prisma.user.findUnique({ where: { id: actorId } });
    if (!currentUser || !(await bcrypt.compare(input.currentPassword, currentUser.passwordHash))) {
      response.status(400).json({ error: "Current password is incorrect" });
      return;
    }
    if (input.currentPassword === input.newPassword) {
      response.status(400).json({ error: "Choose a new password different from your current password" });
      return;
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    const updatedUser = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: currentUser.id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
        include: { customRole: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: "CHANGE_PASSWORD",
          entityType: "User",
          entityId: currentUser.id,
        },
      });
      return updated;
    });
    const csrfToken = issueSession(userView(updatedUser), updatedUser.sessionVersion, response);
    response.json({ user: userView(updatedUser), csrfToken });
  }),
);

app.get(
  "/api/dashboard",
  requireAuth,
  route(async (request, response) => {
    const now = new Date();
    const today = colomboDayStart(now);
    const week = new Date(today.getTime() + 7 * 86_400_000);
    const endOfWeek = new Date(today.getTime() + 8 * 86_400_000);
    const activeTenderStatuses: TenderStatus[] = ["NEW", "PRICE_REQUESTED", "QUOTED"];
    const tenderVisibility = await tenderAccessWhere(request.user!);
    const [activeItems, competitors, registrations, expiredRegistrations, notifications, closingToday, closingThisWeek] =
      await Promise.all([
        prisma.item.count({ where: { active: true } }),
        prisma.competitor.count({ where: { active: true } }),
        prisma.registration.count({ where: { expiryDate: { gte: now } } }),
        prisma.registration.count({ where: { expiryDate: { lt: now } } }),
        prisma.notification.findMany({
          where: {
            acknowledgedAt: null,
            AND: [
              { OR: [{ recipientId: request.user!.id }, { recipientId: null }] },
              { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.tender.count({
          where: { ...tenderVisibility, closingAt: { gte: today, lt: new Date(today.getTime() + 86_400_000) }, status: { in: activeTenderStatuses } },
        }),
        prisma.tender.count({
          where: { ...tenderVisibility, closingAt: { gte: week, lt: endOfWeek }, status: { in: activeTenderStatuses } },
        }),
      ]);
    response.json({
      counts: { activeItems, competitors, registrations, expiredRegistrations },
      notifications,
      closingToday,
      closingThisWeek,
      currency: "LKR",
      registrationExpiryWithinWeek: await prisma.registration.count({
        where: { expiryDate: { gte: today, lt: endOfWeek } },
      }),
    });
  }),
);

app.get(
  "/api/reports/tenders",
  requireAuth,
  tenderReaderRoles,
  route(async (request, response) => {
    const filters = z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      status: z.enum(["NEW", "PRICE_REQUESTED", "QUOTED", "SUBMITTED", "TENDER_READING_DONE", "AWARDED", "LOST", "CANCELLED", "PO_RECEIVED", "COMPLETED"]).optional(),
      representativeId: z.string().uuid().optional(),
    }).parse(request.query);
    if (filters.from && filters.to && filters.from > filters.to) {
      throw new RequestValidationError("The start date must be on or before the end date");
    }
    const closingAt: Prisma.DateTimeFilter = {};
    if (filters.from) closingAt.gte = filters.from;
    if (filters.to) {
      const endOfDay = new Date(filters.to);
      endOfDay.setHours(23, 59, 59, 999);
      closingAt.lte = endOfDay;
    }
    const where: Prisma.TenderWhereInput = {
      ...await tenderAccessWhere(request.user!),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.representativeId ? { responsibleRepId: filters.representativeId } : {}),
      ...(filters.from || filters.to ? { closingAt } : {}),
    };
    const [totalMatching, tenders] = await Promise.all([
      prisma.tender.count({ where }),
      prisma.tender.findMany({
        where,
        take: 500,
        orderBy: [{ closingAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          referenceNumber: true,
          status: true,
          closingAt: true,
          province: true,
          district: true,
          items: { select: { id: true } },
          institution: { select: { id: true, name: true, province: true, district: true } },
          responsibleRep: { select: { id: true, fullName: true } },
          awards: { select: { lines: { select: { wonByUs: true, quantity: true, unitPrice: true } } } },
          purchaseOrders: {
            select: {
              poNumber: true,
              deliveryStatus: true,
              paymentReceived: true,
              performanceBondRequired: true,
              performanceBondStatus: true,
              lines: { select: { quantity: true, unitPrice: true } },
            },
          },
          readings: {
            select: {
              bids: {
                select: {
                  competitorId: true,
                  companyName: true,
                  isOurCompany: true,
                  totalPrice: true,
                  lines: { select: { unitPrice: true, tenderItem: { select: { quantity: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);

    const representativeGroups = new Map<string, { id: string; name: string; tenderCount: number; wonCount: number; lostCount: number; awardedValue: number }>();
    const institutionGroups = new Map<string, { id: string; name: string; tenderCount: number; wonCount: number; lostCount: number; awardedValue: number }>();
    const areaGroups = new Map<string, { province: string; district: string; tenderCount: number; wonCount: number; lostCount: number; awardedValue: number; purchaseOrderValue: number }>();
    const competitorGroups = new Map<string, { id: string | null; name: string; bids: number; bidTotal: number; lowestBidCount: number }>();
    let wonCount = 0;
    let lostCount = 0;
    let awardedValue = 0;
    let purchaseOrderValue = 0;
    let deliveredOrders = 0;
    let pendingDeliveryOrders = 0;
    let unpaidOrders = 0;
    let outstandingBonds = 0;

    const reportTenders = tenders.map((tender) => {
      const awardLines = tender.awards.flatMap((award) => award.lines);
      const tenderAwardValue = awardLines
        .filter((line) => line.wonByUs)
        .reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0);
      const orderValue = tender.purchaseOrders.flatMap((order) => order.lines)
        .reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0);
      const isWon = ["AWARDED", "PO_RECEIVED", "COMPLETED"].includes(tender.status);
      const isLost = tender.status === "LOST";
      if (isWon) wonCount += 1;
      if (isLost) lostCount += 1;
      awardedValue += tenderAwardValue;
      purchaseOrderValue += orderValue;

      const province = tender.province ?? tender.institution.province ?? "Unassigned";
      const district = tender.district ?? tender.institution.district ?? "Unassigned";
      const areaKey = `${province.toLocaleLowerCase()}\u0000${district.toLocaleLowerCase()}`;
      const area = areaGroups.get(areaKey) ?? {
        province,
        district,
        tenderCount: 0,
        wonCount: 0,
        lostCount: 0,
        awardedValue: 0,
        purchaseOrderValue: 0,
      };
      area.tenderCount += 1;
      if (isWon) area.wonCount += 1;
      if (isLost) area.lostCount += 1;
      area.awardedValue += tenderAwardValue;
      area.purchaseOrderValue += orderValue;
      areaGroups.set(areaKey, area);

      const representative = representativeGroups.get(tender.responsibleRep.id) ?? {
        id: tender.responsibleRep.id, name: tender.responsibleRep.fullName,
        tenderCount: 0, wonCount: 0, lostCount: 0, awardedValue: 0,
      };
      representative.tenderCount += 1;
      if (isWon) representative.wonCount += 1;
      if (isLost) representative.lostCount += 1;
      representative.awardedValue += tenderAwardValue;
      representativeGroups.set(representative.id, representative);

      const institution = institutionGroups.get(tender.institution.id) ?? {
        id: tender.institution.id, name: tender.institution.name,
        tenderCount: 0, wonCount: 0, lostCount: 0, awardedValue: 0,
      };
      institution.tenderCount += 1;
      if (isWon) institution.wonCount += 1;
      if (isLost) institution.lostCount += 1;
      institution.awardedValue += tenderAwardValue;
      institutionGroups.set(institution.id, institution);

      for (const order of tender.purchaseOrders) {
        if (order.deliveryStatus === "DELIVERED") deliveredOrders += 1;
        else pendingDeliveryOrders += 1;
        if (!order.paymentReceived) unpaidOrders += 1;
        if (order.performanceBondRequired && !["RETURNED", "EXPIRED"].includes(order.performanceBondStatus)) outstandingBonds += 1;
      }

      for (const reading of tender.readings) {
        const comparable = reading.bids.map((bid) => {
          const itemPrice = bid.lines.reduce((sum, line) => sum + Number(line.unitPrice) * Number(line.tenderItem.quantity), 0);
          const amount = bid.totalPrice === null
            ? bid.lines.length === tender.items.length ? itemPrice : null
            : Number(bid.totalPrice);
          return { bid, amount };
        }).filter((entry): entry is { bid: typeof reading.bids[number]; amount: number } => entry.amount !== null);
        const lowest = comparable.length ? Math.min(...comparable.map((entry) => entry.amount)) : null;
        for (const { bid, amount } of comparable) {
          if (bid.isOurCompany) continue;
          const key = bid.competitorId ?? `name:${bid.companyName.toLocaleLowerCase()}`;
          const group = competitorGroups.get(key) ?? {
            id: bid.competitorId, name: bid.companyName, bids: 0, bidTotal: 0, lowestBidCount: 0,
          };
          group.bids += 1;
          group.bidTotal += amount;
          if (amount === lowest) group.lowestBidCount += 1;
          competitorGroups.set(key, group);
        }
      }
      return {
        id: tender.id,
        referenceNumber: tender.referenceNumber,
        status: tender.status,
        closingAt: tender.closingAt,
        province,
        district,
        institution: tender.institution,
        responsibleRep: tender.responsibleRep,
        awardedValue: tenderAwardValue,
        purchaseOrderValue: orderValue,
        purchaseOrders: tender.purchaseOrders.map(({ lines: _lines, ...order }) => order),
      };
    });
    const decidedCount = wonCount + lostCount;
    response.json({
      generatedAt: new Date().toISOString(),
      truncated: totalMatching > tenders.length,
      totalMatching,
      summary: {
        tenderCount: tenders.length,
        wonCount,
        lostCount,
        winRate: decidedCount ? Math.round(wonCount / decidedCount * 10000) / 100 : 0,
        awardedValue: Math.round(awardedValue * 100) / 100,
        purchaseOrderValue: Math.round(purchaseOrderValue * 100) / 100,
        deliveredOrders,
        pendingDeliveryOrders,
        unpaidOrders,
        outstandingBonds,
      },
      byRepresentative: [...representativeGroups.values()].sort((a, b) => b.awardedValue - a.awardedValue),
      byInstitution: [...institutionGroups.values()].sort((a, b) => b.awardedValue - a.awardedValue),
      byArea: [...areaGroups.values()]
        .map((area) => ({
          ...area,
          awardedValue: Math.round(area.awardedValue * 100) / 100,
          purchaseOrderValue: Math.round(area.purchaseOrderValue * 100) / 100,
        }))
        .sort((a, b) => b.awardedValue - a.awardedValue),
      competitors: [...competitorGroups.values()]
        .map(({ bidTotal, ...group }) => ({ ...group, averageBid: group.bids ? Math.round(bidTotal / group.bids * 100) / 100 : 0 }))
        .sort((a, b) => b.bids - a.bids),
      tenders: reportTenders,
    });
  }),
);

app.post(
  "/api/tenders/:id/items/:itemId/price-prediction",
  requireAuth,
  requireCsrf,
  predictionRoles,
  route(async (request, response) => {
    const tenderId = paramId(request, "id");
    const itemId = paramId(request, "itemId");
    const input = z.object({
      chosenBidPrice: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
      targetWinProbability: z.number().min(0.1).max(0.99).default(0.6),
    }).parse(request.body);
    const tender = await findAccessibleTender(tenderId, request.user!);
    const tenderItem = tender?.items.find((item) => item.id === itemId)
      ? await prisma.tenderItem.findUnique({
          where: { id: itemId },
          select: { id: true, tenderId: true, itemId: true, description: true, quantity: true, estimatedUnitPrice: true },
        })
      : null;
    if (!tender || !tenderItem || tenderItem.tenderId !== tenderId) {
      response.status(404).json({ error: "Tender item not found" });
      return;
    }
    if (!["NEW", "PRICE_REQUESTED", "QUOTED"].includes(tender.status)) {
      response.status(409).json({ error: "Price predictions are available before a tender is submitted." });
      return;
    }

    const [totalReadingCount, historyItems, currentCost] = await Promise.all([
      prisma.tenderReading.count(),
      tenderItem.itemId
        ? prisma.tenderItem.findMany({
            where: { itemId: tenderItem.itemId, tenderId: { not: tenderId } },
            orderBy: { createdAt: "desc" },
            take: 2000,
            select: {
              id: true,
              tenderId: true,
              quantity: true,
              tender: {
                select: {
                  referenceNumber: true,
                  type: true,
                  district: true,
                  institutionId: true,
                  institution: { select: { name: true } },
                  closingAt: true,
                },
              },
              awardLines: {
                select: {
                  unitPrice: true,
                  quantity: true,
                  award: { select: { awardedAt: true } },
                },
              },
              readingBidLines: {
                select: {
                  unitPrice: true,
                  readingBid: {
                    select: {
                      isOurCompany: true,
                      readingId: true,
                      reading: { select: { readingDate: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      prisma.supplierPrice.findFirst({
        where: {
          tenderItemId: itemId,
          OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
          supplier: { is: { active: true } },
        },
        orderBy: { unitPrice: "asc" },
        select: { unitPrice: true },
      }),
    ]);

    const winningSamples = historyItems.flatMap((historyItem) => {
      if (!historyItem.awardLines.length) return [];
      const totalQuantity = historyItem.awardLines.reduce((sum, line) => sum + Number(line.quantity), 0);
      if (totalQuantity <= 0) return [];
      const weightedPrice = historyItem.awardLines.reduce(
        (sum, line) => sum + Number(line.unitPrice) * Number(line.quantity),
        0,
      ) / totalQuantity;
      return [{
        tenderId: historyItem.tenderId,
        referenceNumber: historyItem.tender.referenceNumber,
        institutionName: historyItem.tender.institution.name,
        institutionId: historyItem.tender.institutionId,
        district: historyItem.tender.district,
        tenderType: historyItem.tender.type,
        closingAt: historyItem.tender.closingAt,
        quantity: Number(totalQuantity),
        unitPrice: roundMoney(weightedPrice),
      }];
    });

    const competitorPricesByReading = new Map<string, {
      tenderId: string;
      referenceNumber: string;
      institutionName: string;
      institutionId: string;
      district: string | null;
      tenderType: string;
      closingAt: Date;
      quantity: number;
      lowestUnitPrice: number;
    }>();
    const ownPastBidSamples: { institutionId: string; unitPrice: number }[] = [];
    for (const historyItem of historyItems) {
      for (const line of historyItem.readingBidLines) {
        if (line.readingBid.isOurCompany) {
          ownPastBidSamples.push({
            institutionId: historyItem.tender.institutionId,
            unitPrice: Number(line.unitPrice),
          });
          continue;
        }
        const key = `${historyItem.id}:${line.readingBid.readingId}`;
        const existing = competitorPricesByReading.get(key);
        const unitPrice = Number(line.unitPrice);
        if (existing) {
          existing.lowestUnitPrice = Math.min(existing.lowestUnitPrice, unitPrice);
        } else {
          competitorPricesByReading.set(key, {
            tenderId: historyItem.tenderId,
            referenceNumber: historyItem.tender.referenceNumber,
            institutionName: historyItem.tender.institution.name,
            institutionId: historyItem.tender.institutionId,
            district: historyItem.tender.district,
            tenderType: historyItem.tender.type,
            closingAt: historyItem.tender.closingAt,
            quantity: Number(historyItem.quantity),
            lowestUnitPrice: unitPrice,
          });
        }
      }
    }
    const allCompetitorSamples = [...competitorPricesByReading.values()];
    const matchesCoreContext = (sample: {
      institutionId: string;
      district: string | null;
      tenderType: string;
      closingAt: Date;
    }) => sample.institutionId === tender.institutionId
      && sample.district?.toLowerCase() === tender.district?.toLowerCase()
      && sample.tenderType === tender.type
      && sample.closingAt.getMonth() === tender.closingAt.getMonth();
    const sameCustomerWinningSamples = winningSamples.filter((sample) => sample.institutionId === tender.institutionId);
    const coreContextWinningSamples = winningSamples.filter(matchesCoreContext);
    const basisSamples = coreContextWinningSamples.length >= 5
      ? coreContextWinningSamples
      : sameCustomerWinningSamples.length >= 5
        ? sameCustomerWinningSamples
        : winningSamples;
    const coreContextCompetitors = allCompetitorSamples.filter(matchesCoreContext);
    const sameCustomerCompetitors = allCompetitorSamples.filter((sample) => sample.institutionId === tender.institutionId);
    const competitorSamples = coreContextCompetitors.length >= 5
      ? coreContextCompetitors
      : sameCustomerCompetitors.length >= 5
        ? sameCustomerCompetitors
        : allCompetitorSamples;
    const quantityComparableWinners = basisSamples.filter((sample) => {
      const ratio = sample.quantity / Number(tenderItem.quantity);
      return ratio >= 0.25 && ratio <= 4;
    });
    const quantityComparableCompetitors = competitorSamples.filter((sample) => {
      const ratio = sample.quantity / Number(tenderItem.quantity);
      return ratio >= 0.25 && ratio <= 4;
    });
    const finalWinningSamples = quantityComparableWinners.length >= 5 ? quantityComparableWinners : basisSamples;
    const finalCompetitorSamples = quantityComparableCompetitors.length >= 5 ? quantityComparableCompetitors : competitorSamples;
    const sameCustomerOwnBids = ownPastBidSamples.filter((sample) => sample.institutionId === tender.institutionId);
    const ownBidReferenceSamples = sameCustomerOwnBids.length >= 3 ? sameCustomerOwnBids : ownPastBidSamples;
    const averageOwnPastBid = ownBidReferenceSamples.length
      ? roundMoney(ownBidReferenceSamples.reduce((sum, sample) => sum + sample.unitPrice, 0) / ownBidReferenceSamples.length)
      : null;
    const targetWinProbability = input.targetWinProbability;
    const competitorLowestPrices = finalCompetitorSamples.map((sample) => sample.lowestUnitPrice);
    const recommendedBidPrice = pricePercentile(competitorLowestPrices, 1 - targetWinProbability);
    const currentUnitCost = currentCost ? Number(currentCost.unitPrice) : null;
    const quantity = Number(tenderItem.quantity);
    const insufficientReasons: string[] = [];
    if (!tenderItem.itemId) insufficientReasons.push("This tender line is not linked to an item in the item master.");
    if (totalReadingCount < 100) insufficientReasons.push(`At least 100 tender readings are needed; the system currently has ${totalReadingCount}.`);
    if (finalWinningSamples.length < 5) insufficientReasons.push(`At least 5 historical awarded prices for this item and context are needed; ${finalWinningSamples.length} found.`);
    if (finalCompetitorSamples.length < 5) insufficientReasons.push(`At least 5 historical competitor item-price readings for this item and context are needed; ${finalCompetitorSamples.length} found.`);
    const ready = insufficientReasons.length === 0;
    const chosenBidPrice = ready ? input.chosenBidPrice ?? null : null;
    const actualProbability = ready ? priceWinProbability(competitorLowestPrices, chosenBidPrice) : null;
    const expectedGrossProfit = chosenBidPrice !== null && currentUnitCost !== null
      ? roundMoney((chosenBidPrice - currentUnitCost) * quantity)
      : null;
    const recommendedGrossProfit = recommendedBidPrice !== null && currentUnitCost !== null
      ? roundMoney((recommendedBidPrice - currentUnitCost) * quantity)
      : null;
    const supportSamples = [...finalWinningSamples]
      .sort((a, b) => {
        const score = (sample: typeof a) =>
          Number(sample.institutionId === tender.institutionId) * 4 +
          Number(Boolean(sample.district) && sample.district?.toLowerCase() === tender.district?.toLowerCase()) * 2 +
          Number(sample.tenderType === tender.type);
        return score(b) - score(a) || b.closingAt.getTime() - a.closingAt.getTime();
      })
      .slice(0, 10)
      .map((sample) => {
        const competitor = finalCompetitorSamples.find((candidate) => candidate.tenderId === sample.tenderId);
        return {
          tenderId: sample.tenderId,
          referenceNumber: sample.referenceNumber,
          institutionName: sample.institutionName,
          closingAt: sample.closingAt,
          awardedUnitPrice: sample.unitPrice,
          competitorLowestUnitPrice: competitor?.lowestUnitPrice ?? null,
        };
      });

    const priceLow = ready ? pricePercentile(finalWinningSamples.map((sample) => sample.unitPrice), 0.1) : null;
    const priceMostLikely = ready
      ? roundMoney(finalWinningSamples.reduce((sum, sample) => sum + sample.unitPrice, 0) / finalWinningSamples.length)
      : null;
    const priceHigh = ready ? pricePercentile(finalWinningSamples.map((sample) => sample.unitPrice), 0.9) : null;
    const confidence = ready
      ? Math.min(finalWinningSamples.length, finalCompetitorSamples.length) >= 50 ? "HIGH"
        : Math.min(finalWinningSamples.length, finalCompetitorSamples.length) >= 15 ? "MEDIUM" : "LOW"
      : "INSUFFICIENT";

    const run = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.pricePredictionRun.create({
        data: {
          tenderId,
          tenderItemId: itemId,
          requestedById: request.user!.id,
          status: ready ? "READY" : "INSUFFICIENT_DATA",
          totalReadingCount,
          winningSampleCount: finalWinningSamples.length,
          competitorSampleCount: finalCompetitorSamples.length,
          targetWinProbability: ready ? targetWinProbability : null,
          chosenBidPrice,
          chosenWinProbability: actualProbability,
          predictedLow: priceLow,
          predictedMostLikely: priceMostLikely,
          predictedHigh: priceHigh,
          recommendedBidPrice: ready ? recommendedBidPrice : null,
          currentUnitCost: canViewPricingCosts(request.user!) ? currentUnitCost : null,
          expectedGrossProfit,
          supportTenderIds: supportSamples.map((sample) => sample.tenderId),
        },
      });
      await writeAudit(transaction, request.user?.id, "CREATE", "PricePredictionRun", saved.id, {
        tenderId,
        tenderItemId: itemId,
        status: saved.status,
        modelVersion: saved.modelVersion,
      });
      return saved;
    });

    response.json({
      id: run.id,
      status: run.status,
      modelVersion: run.modelVersion,
      confidence,
      totalReadingCount,
      winningSampleCount: finalWinningSamples.length,
      competitorSampleCount: finalCompetitorSamples.length,
      reasons: insufficientReasons,
      predictedPriceRange: ready ? { low: priceLow, mostLikely: priceMostLikely, high: priceHigh } : null,
      targetWinProbability: ready ? targetWinProbability : null,
      chosenBidPrice,
      chosenWinProbability: actualProbability,
      recommendedBidPrice: ready ? recommendedBidPrice : null,
      currentUnitCost,
      customerEstimatedUnitPrice: tenderItem.estimatedUnitPrice === null ? null : Number(tenderItem.estimatedUnitPrice),
      averageOwnPastBid,
      ownPastBidCount: ownBidReferenceSamples.length,
      expectedGrossProfit: canViewPricingCosts(request.user!) ? expectedGrossProfit : null,
      recommendedGrossProfit: canViewPricingCosts(request.user!) ? recommendedGrossProfit : null,
      profitNote: canViewPricingCosts(request.user!)
        ? "Estimated gross profit uses the lowest current supplier price and excludes transport, installation, bond, commission, tax, and discounts."
        : "",
      supportingTenders: supportSamples,
      adjustmentNote: "Historical prices are nominal; no inflation or exchange-rate series is configured.",
    });
  }),
);

app.get(
  "/api/reports/prediction-accuracy",
  requireAuth,
  tenderReaderRoles,
  route(async (request, response) => {
    const runs = await prisma.pricePredictionRun.findMany({
      where: {
        status: "READY",
        tenderItem: { awardLines: { some: {} } },
        ...(request.user?.role === "SALES_REP" ? { tender: { is: await tenderAccessWhere(request.user) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        createdAt: true,
        predictedMostLikely: true,
        tender: { select: { referenceNumber: true } },
        tenderItem: {
          select: {
            description: true,
            awardLines: {
              select: {
                unitPrice: true,
                award: { select: { awardedAt: true } },
              },
            },
          },
        },
      },
    });
    const evaluated = runs.flatMap((run) => {
      const actual = [...run.tenderItem.awardLines]
        .sort((a, b) => b.award.awardedAt.getTime() - a.award.awardedAt.getTime())[0];
      if (!actual || !run.predictedMostLikely || Number(actual.unitPrice) <= 0) return [];
      const actualPrice = Number(actual.unitPrice);
      const predictedPrice = Number(run.predictedMostLikely);
      return [{
        id: run.id,
        tenderReference: run.tender.referenceNumber,
        itemDescription: run.tenderItem.description,
        predictedPrice,
        actualPrice,
        errorPercent: Math.abs(predictedPrice - actualPrice) / actualPrice * 100,
        predictionDate: run.createdAt,
      }];
    });
    const meanAbsolutePercentageError = evaluated.length
      ? Math.round(evaluated.reduce((sum, record) => sum + record.errorPercent, 0) / evaluated.length * 100) / 100
      : null;
    response.json({
      evaluatedCount: evaluated.length,
      meanAbsolutePercentageError,
      records: evaluated.slice(0, 100),
    });
  }),
);

app.get(
  "/api/company",
  requireAuth,
  route(async (request, response) => {
    const profile = await prisma.companyProfile.findUnique({ where: { id: "default" } });
    response.json(profile && !canViewPricingCosts(request.user!)
      ? { ...profile, minimumMarginPercent: null }
      : profile);
  }),
);

const companySchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(2000),
  email: z.string().email(),
  officePhone1: z.string().trim().min(1).max(40),
  officePhone2: z.string().trim().max(40).optional().nullable(),
  brNumber: z.string().trim().min(1).max(100),
  vatRegistrationNumber: z.string().trim().min(1).max(100),
  quotationValidityDays: z.number().int().min(1).max(365),
  vatRate: z.number().min(0).max(100),
  minimumMarginPercent: z.number().min(0).max(1000),
  theme: z.enum(["forest", "ocean", "plum"]).default("forest"),
});

app.put(
  "/api/company",
  requireAuth,
  requireCsrf,
  adminOnly,
  route(async (request, response) => {
    const data = companySchema.parse(request.body);
    const profile = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.companyProfile.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      });
      await writeAudit(transaction, request.user?.id, "UPSERT", "CompanyProfile", saved.id);
      return saved;
    });
    response.json(profile);
  }),
);

app.delete(
  "/api/company/item-master",
  requireAuth,
  requireCsrf,
  adminOnly,
  route(async (request, response) => {
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const [tenderReferences, registrationReferences] = await Promise.all([
          transaction.tenderItem.count({ where: { itemId: { not: null } } }),
          transaction.registrationItem.count(),
        ]);
        if (tenderReferences || registrationReferences) {
          return { blocked: true, tenderReferences, registrationReferences };
        }

        const items = await transaction.item.deleteMany();
        const categories = await transaction.itemCategory.deleteMany();
        const brands = await transaction.brand.deleteMany();
        const units = await transaction.unit.deleteMany();
        const deleted = {
          items: items.count,
          categories: categories.count,
          brands: brands.count,
          units: units.count,
        };
        await writeAudit(transaction, request.user?.id, "DELETE_ALL", "ItemMaster", undefined, deleted);
        return { blocked: false, deleted };
      });

      if (result.blocked) {
        response.status(409).json({
          error: `Cannot delete item master data while ${result.tenderReferences} tender item record(s) and ${result.registrationReferences} supplier registration item record(s) reference catalogue items.`,
        });
        return;
      }
      response.json(result.deleted);
    } catch (reason) {
      if (typeof reason === "object" && reason !== null && "code" in reason && reason.code === "P2003") {
        response.status(409).json({ error: "Cannot delete item master data because catalogue items are still referenced by business records." });
        return;
      }
      throw reason;
    }
  }),
);

app.post(
  "/api/items/import",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const items = itemImportSchema.parse(request.body);
    const codes = items.map(({ code }) => code.toLowerCase());
    if (new Set(codes).size !== codes.length) {
      throw new RequestValidationError("The Excel file contains duplicate item codes.");
    }

    const existing = await prisma.item.findMany({
      where: { code: { in: items.map(({ code }) => code), mode: "insensitive" } },
      select: { code: true },
    });
    if (existing.length) {
      response.status(409).json({
        error: `These item codes already exist and were not imported: ${existing.map(({ code }) => code).join(", ")}`,
      });
      return;
    }

    const unitIds = [...new Set(items.map(({ unitId }) => unitId))];
    const importSummary = await prisma.$transaction(async (transaction) => {
      const [categoryRecords, brandRecords, units] = await Promise.all([
        transaction.itemCategory.findMany({ select: { id: true, name: true, active: true } }),
        transaction.brand.findMany({ select: { id: true, name: true, active: true } }),
        transaction.unit.findMany({ where: { id: { in: unitIds }, active: true }, select: { id: true } }),
      ]);
      if (units.length !== unitIds.length) {
        throw new RequestValidationError("Select active unit values from the item master.");
      }

      const activeCategoryIds = new Set(categoryRecords.filter(({ active }) => active).map(({ id }) => id));
      const activeBrandIds = new Set(brandRecords.filter(({ active }) => active).map(({ id }) => id));
      const invalidLegacyCategoryId = items.some(({ categoryName, categoryId }) =>
        categoryName === undefined && categoryId && !activeCategoryIds.has(categoryId));
      const invalidLegacyBrandId = items.some(({ brandName, brandId }) =>
        brandName === undefined && brandId && !activeBrandIds.has(brandId));
      if (invalidLegacyCategoryId || invalidLegacyBrandId) {
        throw new RequestValidationError("Select active category and brand values from the item master.");
      }

      const categoryLookup = buildMasterNameLookup(categoryRecords);
      const brandLookup = buildMasterNameLookup(brandRecords);
      let categoriesCreated = 0;
      let categoriesReactivated = 0;
      let brandsCreated = 0;
      let brandsReactivated = 0;
      let brandsAssignedToOther = 0;

      for (const { categoryName } of items) {
        if (!categoryName) continue;
        const key = normalizeMasterName(categoryName);
        const category = categoryLookup.get(key);
        if (category?.active) continue;
        if (category) {
          const reactivated = await transaction.itemCategory.update({
            where: { id: category.id },
            data: { active: true },
          });
          categoryLookup.set(key, reactivated);
          categoriesReactivated += 1;
          await writeAudit(transaction, request.user?.id, "ACTIVATE", "ItemCategory", reactivated.id);
          continue;
        }
        const created = await transaction.itemCategory.create({ data: { name: categoryName } });
        categoryLookup.set(key, created);
        categoriesCreated += 1;
        await writeAudit(transaction, request.user?.id, "CREATE", "ItemCategory", created.id);
      }

      for (const { brandName } of items) {
        if (brandName === undefined) continue;
        if (!brandName) {
          brandsAssignedToOther += 1;
          continue;
        }
        const key = normalizeMasterName(brandName);
        const brand = brandLookup.get(key);
        if (!brand) {
          const created = await transaction.brand.create({ data: { name: brandName } });
          brandLookup.set(key, created);
          brandsCreated += 1;
          await writeAudit(transaction, request.user?.id, "CREATE", "Brand", created.id);
          continue;
        }
        if (!brand.active) {
          const reactivated = await transaction.brand.update({
            where: { id: brand.id },
            data: { active: true },
          });
          brandLookup.set(key, reactivated);
          brandsReactivated += 1;
          await writeAudit(transaction, request.user?.id, "ACTIVATE", "Brand", reactivated.id);
        }
      }

      let otherBrand = brandsAssignedToOther
        ? brandLookup.get(normalizeMasterName("Other"))
        : undefined;
      if (brandsAssignedToOther && !otherBrand) {
        otherBrand = await transaction.brand.create({ data: { name: "Other" } });
        brandLookup.set(normalizeMasterName("Other"), otherBrand);
        await writeAudit(transaction, request.user?.id, "CREATE", "Brand", otherBrand.id);
      } else if (otherBrand && !otherBrand.active) {
        otherBrand = await transaction.brand.update({
          where: { id: otherBrand.id },
          data: { active: true },
        });
        brandLookup.set(normalizeMasterName("Other"), otherBrand);
        brandsReactivated += 1;
        await writeAudit(transaction, request.user?.id, "ACTIVATE", "Brand", otherBrand.id);
      }

      const importData = items.map(({ categoryName, brandName, categoryId, brandId, ...item }) => {
        const category = categoryName
          ? categoryLookup.get(normalizeMasterName(categoryName))
          : undefined;
        const requestedBrand = brandName
          ? brandLookup.get(normalizeMasterName(brandName))
          : undefined;
        return {
          ...item,
          categoryId: categoryName !== undefined ? category?.id ?? null : categoryId ?? null,
          brandId: brandName !== undefined
            ? requestedBrand?.id ?? otherBrand?.id ?? null
            : brandId ?? null,
        };
      });

      await transaction.item.createMany({ data: importData });
      const created = await transaction.item.findMany({
        where: { code: { in: items.map(({ code }) => code) } },
        select: { id: true },
      });
      await transaction.auditLog.createMany({
        data: created.map(({ id }) => ({
          actorId: request.user?.id,
          action: "CREATE",
          entityType: "Item",
          entityId: id,
        })),
      });
      return { categoriesCreated, categoriesReactivated, brandsCreated, brandsReactivated, brandsAssignedToOther };
    }, { maxWait: 10_000, timeout: 30_000 });
    response.status(201).json({ imported: items.length, ...importSummary });
  }),
);

const itemSearchQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

app.get(
  "/api/items/search",
  requireAuth,
  route(async (request, response) => {
    const { q, limit } = itemSearchQuerySchema.parse(request.query);
    const searchConditions: Prisma.ItemWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { modelSpecification: { contains: q, mode: "insensitive" } },
      { category: { is: { name: { contains: q, mode: "insensitive" } } } },
      { brand: { is: { name: { contains: q, mode: "insensitive" } } } },
    ];
    const found = await prisma.item.findMany({
      where: { active: true, ...(q ? { OR: searchConditions } : {}) },
      include: { category: true, brand: true, unit: true },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      take: limit,
    });
    response.json(found);
  }),
);

app.get(
  "/api/items",
  requireAuth,
  route(async (_request, response) => {
    response.json(await prisma.item.findMany({
      include: { category: true, brand: true, unit: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }));
  }),
);

const masterNameSchema = z.object({
  name: z.string().trim().min(1).max(100),
  active: z.boolean().optional(),
});

const unitSchema = masterNameSchema.extend({
  abbreviation: z.string().trim().min(1).max(20),
});

app.get(
  "/api/item-categories",
  requireAuth,
  route(async (_request, response) => {
    response.json(await prisma.itemCategory.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }));
  }),
);

app.post(
  "/api/item-categories",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const category = await prisma.$transaction(async (transaction) => {
      const created = await transaction.itemCategory.create({ data: masterNameSchema.parse(request.body) });
      await writeAudit(transaction, request.user?.id, "CREATE", "ItemCategory", created.id);
      return created;
    });
    response.status(201).json(category);
  }),
);

app.put(
  "/api/item-categories/:id",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const category = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.itemCategory.update({
        where: { id: paramMasterId(request) },
        data: masterNameSchema.parse(request.body),
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "ItemCategory", updated.id);
      return updated;
    });
    response.json(category);
  }),
);

app.delete(
  "/api/item-categories/:id",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const category = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.itemCategory.update({
        where: { id: paramMasterId(request) },
        data: { active: false },
      });
      await writeAudit(transaction, request.user?.id, "DEACTIVATE", "ItemCategory", updated.id);
      return updated;
    });
    response.json(category);
  }),
);

app.get(
  "/api/brands",
  requireAuth,
  route(async (_request, response) => {
    response.json(await prisma.brand.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }));
  }),
);

app.post(
  "/api/brands",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const brand = await prisma.$transaction(async (transaction) => {
      const created = await transaction.brand.create({ data: masterNameSchema.parse(request.body) });
      await writeAudit(transaction, request.user?.id, "CREATE", "Brand", created.id);
      return created;
    });
    response.status(201).json(brand);
  }),
);

app.put(
  "/api/brands/:id",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const brand = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.brand.update({
        where: { id: paramMasterId(request) },
        data: masterNameSchema.parse(request.body),
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "Brand", updated.id);
      return updated;
    });
    response.json(brand);
  }),
);

app.delete(
  "/api/brands/:id",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const brand = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.brand.update({
        where: { id: paramMasterId(request) },
        data: { active: false },
      });
      await writeAudit(transaction, request.user?.id, "DEACTIVATE", "Brand", updated.id);
      return updated;
    });
    response.json(brand);
  }),
);

app.get(
  "/api/units",
  requireAuth,
  route(async (_request, response) => {
    response.json(await prisma.unit.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }));
  }),
);

app.post(
  "/api/units",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const unit = await prisma.$transaction(async (transaction) => {
      const created = await transaction.unit.create({ data: unitSchema.parse(request.body) });
      await writeAudit(transaction, request.user?.id, "CREATE", "Unit", created.id);
      return created;
    });
    response.status(201).json(unit);
  }),
);

app.put(
  "/api/units/:id",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const unit = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.unit.update({
        where: { id: paramMasterId(request) },
        data: unitSchema.parse(request.body),
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "Unit", updated.id);
      return updated;
    });
    response.json(unit);
  }),
);

app.delete(
  "/api/units/:id",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const unit = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.unit.update({
        where: { id: paramMasterId(request) },
        data: { active: false },
      });
      await writeAudit(transaction, request.user?.id, "DEACTIVATE", "Unit", updated.id);
      return updated;
    });
    response.json(unit);
  }),
);

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().max(150).optional().nullable(),
  contactNumber: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().trim().max(1000).optional().nullable(),
  active: z.boolean().optional(),
});

app.get(
  "/api/suppliers",
  requireAuth,
  route(async (_request, response) => {
    response.json(await prisma.supplier.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }));
  }),
);

app.post(
  "/api/suppliers",
  requireAuth,
  requireCsrf,
  allowRoles("ADMIN"),
  route(async (request, response) => {
    const supplier = await prisma.$transaction(async (transaction) => {
      const created = await transaction.supplier.create({ data: supplierSchema.parse(request.body) });
      await writeAudit(transaction, request.user?.id, "CREATE", "Supplier", created.id);
      return created;
    });
    response.status(201).json(supplier);
  }),
);

app.put(
  "/api/suppliers/:id",
  requireAuth,
  requireCsrf,
  allowRoles("ADMIN"),
  route(async (request, response) => {
    const supplier = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.supplier.update({
        where: { id: paramMasterId(request) },
        data: supplierSchema.parse(request.body),
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "Supplier", updated.id);
      return updated;
    });
    response.json(supplier);
  }),
);

app.delete(
  "/api/suppliers/:id",
  requireAuth,
  requireCsrf,
  allowRoles("ADMIN"),
  route(async (request, response) => {
    const supplier = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.supplier.update({
        where: { id: paramMasterId(request) },
        data: { active: false },
      });
      await writeAudit(transaction, request.user?.id, "DEACTIVATE", "Supplier", updated.id);
      return updated;
    });
    response.json(supplier);
  }),
);

app.post(
  "/api/items",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const item = await prisma.$transaction(async (transaction) => {
      const data = itemSchema.parse(request.body);
      await validateItemOptions(transaction, data);
      const created = await transaction.item.create({
        data,
        include: { category: true, brand: true, unit: true },
      });
      await writeAudit(transaction, request.user?.id, "CREATE", "Item", created.id);
      return created;
    });
    response.status(201).json(item);
  }),
);

app.put(
  "/api/items/:id",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const item = await prisma.$transaction(async (transaction) => {
      const id = paramId(request);
      const previous = await transaction.item.findUniqueOrThrow({
        where: { id },
        select: { categoryId: true, brandId: true, unitId: true },
      });
      const data = itemSchema.parse(request.body);
      await validateItemOptions(transaction, data, previous);
      const updated = await transaction.item.update({
        where: { id },
        data,
        include: { category: true, brand: true, unit: true },
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "Item", updated.id);
      return updated;
    });
    response.json(item);
  }),
);

app.delete(
  "/api/items/:id",
  requireAuth,
  requireCsrf,
  itemEditorRoles,
  route(async (request, response) => {
    const item = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.item.update({
        where: { id: paramId(request) },
        data: { active: false },
        include: { category: true, brand: true, unit: true },
      });
      await writeAudit(transaction, request.user?.id, "DEACTIVATE", "Item", updated.id);
      return updated;
    });
    response.json(item);
  }),
);

const tenderItemInputSchema = z.object({
  itemId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(200),
  specification: z.string().trim().max(1000).optional().nullable(),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(50),
  estimatedUnitPrice: z.number().nonnegative().optional().nullable(),
});

const tenderInputSchema = z.object({
  referenceNumber: z.string().trim().min(1).max(100),
  type: z.enum(["OPEN", "LETTERS", "WALK_IN"]),
  institutionId: z.string().uuid(),
  source: z.string().trim().max(300).optional().nullable(),
  letterReceivedAt: z.coerce.date().optional().nullable(),
  visitAt: z.coerce.date().optional().nullable(),
  contactOfficer: z.string().trim().max(150).optional().nullable(),
  closingAt: z.coerce.date(),
  province: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().max(100).optional().nullable(),
  responsibleRepId: z.string().uuid(),
  bidBondRequired: z.boolean().default(false),
  bidBondAmount: z.number().nonnegative().optional().nullable(),
  bidBondBank: z.string().refine(isSriLankaBankCode, "Select a valid Sri Lankan bank.").optional().nullable(),
  bidBondNumber: z.string().trim().max(100).optional().nullable(),
  bidBondIssueDate: z.coerce.date().optional().nullable(),
  bidBondExpiryDate: z.coerce.date().optional().nullable(),
  bidBondStatus: z.enum(["REQUESTED", "ISSUED", "SUBMITTED", "RETURNED", "EXPIRED"]).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  items: z.array(tenderItemInputSchema).min(1).max(100),
});

const tenderInclude = {
  institution: true,
  responsibleRep: { select: { id: true, fullName: true, email: true } },
  documents: { select: { id: true, type: true, fileName: true, contentType: true, createdAt: true } },
  items: {
    include: {
      item: { include: { category: true, brand: true, unit: true } },
      supplierPrices: { include: { requestedBy: { select: { id: true, fullName: true } } }, orderBy: { unitPrice: "asc" as const } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  quotations: {
    include: {
      lines: { include: { tenderItem: true, supplierPrice: true }, orderBy: { createdAt: "asc" as const } },
      createdBy: { select: { id: true, fullName: true } },
      managerApprovedBy: { select: { id: true, fullName: true } },
      directorApprovedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { version: "desc" as const },
  },
};

type CostSensitiveQuotationLine = {
  pricingMethod: unknown;
  costBaseMethod: unknown;
  supplierPriceId: unknown;
  baseUnitCost: unknown;
  transportCost: unknown;
  installationCost: unknown;
  bondCost: unknown;
  commissionCost: unknown;
  marginPercent: unknown;
  grossProfit: unknown;
  supplierPrice: unknown;
};

function redactQuotationCosts<T extends { grossProfit: unknown; lines: CostSensitiveQuotationLine[] }>(quotation: T) {
  return {
    ...quotation,
    grossProfit: null,
    lines: quotation.lines.map((line) => ({
      ...line,
      pricingMethod: null,
      costBaseMethod: null,
      supplierPriceId: null,
      baseUnitCost: null,
      transportCost: null,
      installationCost: null,
      bondCost: null,
      commissionCost: null,
      marginPercent: null,
      grossProfit: null,
      supplierPrice: null,
    })),
  };
}

function redactTenderCosts<T extends {
  items: Array<{ supplierPrices: Array<{ validUntil: Date | null }> }>;
  quotations: Array<{ grossProfit: unknown; lines: CostSensitiveQuotationLine[] }>;
}>(tender: T) {
  return {
    ...tender,
    items: tender.items.map((item) => ({
      ...item,
      hasCurrentSupplierPrice: item.supplierPrices.some((price) => isSupplierPriceCurrent(price.validUntil)),
      supplierPrices: [],
    })),
    quotations: tender.quotations.map(redactQuotationCosts),
  };
}

async function registrationWarning(institutionId: string, closingAt: Date): Promise<boolean> {
  const registration = await prisma.registration.findFirst({
    where: {
      institutionId,
      expiryDate: { gte: closingAt },
      renewals: { none: {} },
    },
    select: { id: true },
  });
  return !registration;
}

app.get(
  "/api/tender-reps",
  requireAuth,
  tenderReaderRoles,
  route(async (_request, response) => {
    response.json(await prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "TENDER_MANAGER", "SALES_REP"] } },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: "asc" },
    }));
  }),
);

app.get(
  "/api/tenders",
  requireAuth,
  tenderReaderRoles,
  route(async (request, response) => {
    const records = await prisma.tender.findMany({
      where: await tenderAccessWhere(request.user!),
      include: tenderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    response.json(await Promise.all(records.map(async (record) => ({
      ...(canViewPricingCosts(request.user!) ? record : redactTenderCosts(record)),
      registrationWarning: await registrationWarning(record.institutionId, record.closingAt),
    }))));
  }),
);

app.get(
  "/api/tender-suppliers",
  requireAuth,
  tenderReaderRoles,
  route(async (_request, response) => {
    response.json(await prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }));
  }),
);

app.post(
  "/api/tenders",
  requireAuth,
  requireCsrf,
  tenderEditorRoles,
  route(async (request, response) => {
    const input = tenderInputSchema.parse(request.body);
    if (request.user?.role === "SALES_REP" && input.responsibleRepId !== request.user.id) {
      response.status(403).json({ error: "Sales representatives can only assign tenders to themselves" });
      return;
    }
    const rep = await prisma.user.findFirst({
      where: { id: input.responsibleRepId, active: true, role: { in: ["ADMIN", "TENDER_MANAGER", "SALES_REP"] } },
      select: { id: true },
    });
    if (!rep) {
      response.status(400).json({ error: "Select an active tender manager or sales representative" });
      return;
    }
    const itemIds = input.items.flatMap((item) => item.itemId ? [item.itemId] : []);
    const activeItems = await prisma.item.findMany({
      where: { id: { in: itemIds }, active: true },
      select: { id: true, name: true, unit: { select: { name: true } } },
    });
    if (activeItems.length !== new Set(itemIds).size) {
      response.status(400).json({ error: "Select active items from the item master" });
      return;
    }
    const activeById = new Map(activeItems.map((item) => [item.id, item]));
    const created = await prisma.$transaction(async (transaction) => {
      const tender = await transaction.tender.create({
        data: {
          referenceNumber: input.referenceNumber,
          type: input.type,
          institutionId: input.institutionId,
          source: input.source,
          letterReceivedAt: input.letterReceivedAt,
          visitAt: input.visitAt,
          contactOfficer: input.contactOfficer,
          closingAt: input.closingAt,
          province: input.province,
          district: input.district,
          responsibleRepId: input.responsibleRepId,
          bidBondRequired: input.bidBondRequired,
          bidBondAmount: input.bidBondAmount,
          bidBondBank: input.bidBondBank,
          bidBondNumber: input.bidBondNumber,
          bidBondIssueDate: input.bidBondIssueDate,
          bidBondExpiryDate: input.bidBondExpiryDate,
          bidBondStatus: input.bidBondRequired ? input.bidBondStatus ?? "REQUESTED" : null,
          notes: input.notes,
          items: {
            create: input.items.map((line) => {
              const masterItem = line.itemId ? activeById.get(line.itemId) : undefined;
              return {
                itemId: masterItem?.id,
                description: line.description,
                specification: line.specification,
                quantity: line.quantity,
                unit: line.unit || masterItem?.unit.name || "Each",
                estimatedUnitPrice: line.estimatedUnitPrice,
              };
            }),
          },
        },
        include: tenderInclude,
      });
      await writeAudit(transaction, request.user?.id, "CREATE", "Tender", tender.id, { type: tender.type });
      return tender;
    });
    response.status(201).json({
      ...created,
      registrationWarning: await registrationWarning(created.institutionId, created.closingAt),
    });
  }),
);

app.post(
  "/api/tender-items/:id/prices",
  requireAuth,
  requireCsrf,
  supplierPriceRoles,
  route(async (request, response) => {
    const input = z.object({
      supplierId: z.string().trim().min(1).max(100),
      unitPrice: z.number().nonnegative().max(1_000_000_000),
      givenBy: z.string().trim().max(150).optional().nullable(),
      receivedAt: z.coerce.date().optional(),
      validUntil: z.coerce.date().optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
    }).parse(request.body);
    const tenderItem = await prisma.tenderItem.findUnique({
      where: { id: paramId(request) },
      include: { tender: true },
    });
    const accessibleTender = tenderItem && request.user
      ? await findAccessibleTender(tenderItem.tenderId, request.user)
      : null;
    if (!tenderItem || !accessibleTender || !request.user) {
      response.status(404).json({ error: "Tender item not found" });
      return;
    }
    const price = await prisma.$transaction(async (transaction) => {
      const supplier = await transaction.supplier.findFirst({
        where: { id: input.supplierId, active: true },
        select: { id: true, name: true },
      });
      if (!supplier) {
        throw new RequestValidationError("Select an active supplier");
      }
      const created = await transaction.supplierPrice.create({
        data: {
          ...input,
          supplierId: supplier.id,
          supplierName: supplier.name,
          tenderItemId: tenderItem.id,
          requestedById: request.user!.id,
        },
        include: { requestedBy: { select: { id: true, fullName: true } } },
      });
      if (tenderItem.tender.status === "NEW") {
        await transaction.tender.update({ where: { id: tenderItem.tenderId }, data: { status: "PRICE_REQUESTED" } });
      }
      await writeAudit(transaction, request.user?.id, "CREATE", "SupplierPrice", created.id, { tenderItemId: tenderItem.id });
      return created;
    });
    response.status(201).json(price);
  }),
);

app.patch(
  "/api/supplier-prices/:id",
  requireAuth,
  requireCsrf,
  supplierPriceRoles,
  route(async (request, response) => {
    const input = z.object({
      unitPrice: z.number().nonnegative().max(1_000_000_000),
      givenBy: z.string().trim().max(150).optional().nullable(),
      receivedAt: z.coerce.date().optional(),
      validUntil: z.coerce.date().optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
    }).parse(request.body);
    const id = paramId(request);
    const existing = await prisma.supplierPrice.findUnique({
      where: { id },
      include: { tenderItem: { select: { tenderId: true } } },
    });
    const accessibleTender = existing && request.user
      ? await findAccessibleTender(existing.tenderItem.tenderId, request.user)
      : null;
    if (!existing || !accessibleTender) {
      response.status(404).json({ error: "Supplier price not found" });
      return;
    }
    const updated = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.supplierPrice.update({
        where: { id },
        data: input,
        include: { requestedBy: { select: { id: true, fullName: true } } },
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "SupplierPrice", saved.id, {
        tenderItemId: existing.tenderItemId,
        before: {
          unitPrice: existing.unitPrice.toString(),
          givenBy: existing.givenBy,
          receivedAt: existing.receivedAt.toISOString(),
          validUntil: existing.validUntil?.toISOString() ?? null,
          notes: existing.notes,
        },
        after: {
          unitPrice: saved.unitPrice.toString(),
          givenBy: saved.givenBy,
          receivedAt: saved.receivedAt.toISOString(),
          validUntil: saved.validUntil?.toISOString() ?? null,
          notes: saved.notes,
        },
      });
      return saved;
    });
    response.json(updated);
  }),
);

app.get(
  "/api/tenders/:id",
  requireAuth,
  tenderReaderRoles,
  route(async (request, response) => {
    const tender = await prisma.tender.findFirst({
      where: {
        id: paramId(request),
        ...await tenderAccessWhere(request.user!),
      },
      include: tenderInclude,
    });
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    const company = await prisma.companyProfile.findUnique({ where: { id: "default" } });
    response.json({
      ...(canViewPricingCosts(request.user!) ? tender : redactTenderCosts(tender)),
      registrationWarning: await registrationWarning(tender.institutionId, tender.closingAt),
      company: company && !canViewPricingCosts(request.user!)
        ? { ...company, minimumMarginPercent: null }
        : company,
    });
  }),
);

app.patch(
  "/api/tenders/:id/bid-bond",
  requireAuth,
  requireCsrf,
  tenderEditorRoles,
  route(async (request, response) => {
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (!tender.bidBondRequired) {
      response.status(400).json({ error: "Bid bond is not required for this tender" });
      return;
    }
    const input = z.object({
      bidBondStatus: z.enum(["REQUESTED", "ISSUED", "SUBMITTED", "RETURNED", "EXPIRED"]).optional(),
      bidBondAmount: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
      bidBondBank: z.string().refine(isSriLankaBankCode, "Select a valid Sri Lankan bank.").nullable().optional(),
      bidBondNumber: z.string().trim().max(100).nullable().optional(),
      bidBondIssueDate: z.coerce.date().nullable().optional(),
      bidBondExpiryDate: z.coerce.date().nullable().optional(),
    }).strict().refine((value) => Object.values(value).some((field) => field !== undefined), {
      message: "Provide at least one bid bond field to update",
    }).refine((value) => !value.bidBondIssueDate || !value.bidBondExpiryDate || value.bidBondExpiryDate >= value.bidBondIssueDate, {
      message: "Bond expiry date must be on or after the issue date",
      path: ["bidBondExpiryDate"],
    }).parse(request.body);
    const updated = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.tender.update({
        where: { id: tender.id },
        data: input,
        select: {
          id: true,
          bidBondAmount: true,
          bidBondBank: true,
          bidBondNumber: true,
          bidBondIssueDate: true,
          bidBondExpiryDate: true,
          bidBondStatus: true,
        },
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "Tender", tender.id, {
        updatedFields: Object.keys(input),
        ...(input.bidBondStatus ? {
          fromStatus: tender.bidBondStatus ?? "REQUESTED",
          toStatus: input.bidBondStatus,
        } : {}),
      });
      return saved;
    });
    response.json(updated);
  }),
);

app.post(
  "/api/tenders/:id/documents",
  requireAuth,
  requireCsrf,
  tenderEditorRoles,
  businessDocumentUpload,
  route(async (request, response) => {
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    const type = z.enum(["TENDER_DOCUMENT", "ADDENDUM", "OTHER"]).default("TENDER_DOCUMENT").parse(request.query.type);
    const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
    const data = validatedDocumentData(request, contentType);
    const fileName = documentFileName(request.query.fileName);
    const document = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.tenderDocument.create({
        data: { tenderId: tender.id, type, fileName, contentType, data },
        select: { id: true, type: true, fileName: true, contentType: true, createdAt: true },
      });
      await writeAudit(transaction, request.user?.id, "UPLOAD", "TenderDocument", saved.id, {
        tenderId: tender.id,
        type,
        fileName: saved.fileName,
      });
      return saved;
    });
    response.status(201).json(document);
  }),
);

app.get(
  "/api/tenders/:id/documents/:documentId",
  requireAuth,
  tenderReaderRoles,
  route(async (request, response) => {
    const tender = await findAccessibleTender(paramId(request), request.user!);
    const document = tender
      ? await prisma.tenderDocument.findFirst({
          where: { id: paramId(request, "documentId"), tenderId: tender.id },
        })
      : null;
    if (!document) {
      response.status(404).json({ error: "Tender document not found" });
      return;
    }
    sendDocument(response, document);
  }),
);

app.delete(
  "/api/tenders/:id/documents/:documentId",
  requireAuth,
  requireCsrf,
  tenderEditorRoles,
  route(async (request, response) => {
    const tender = await findAccessibleTender(paramId(request), request.user!);
    const document = tender
      ? await prisma.tenderDocument.findFirst({
          where: { id: paramId(request, "documentId"), tenderId: tender.id },
          select: { id: true, fileName: true },
        })
      : null;
    if (!document || !tender) {
      response.status(404).json({ error: "Tender document not found" });
      return;
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.tenderDocument.delete({ where: { id: document.id } });
      await writeAudit(transaction, request.user?.id, "DELETE", "TenderDocument", document.id, {
        tenderId: tender.id,
        fileName: document.fileName,
      });
    });
    response.status(204).end();
  }),
);

const readingBidSchema = z.object({
  competitorId: z.string().uuid().optional().nullable(),
  companyName: z.string().trim().min(1).max(200),
  isOurCompany: z.boolean().default(false),
  totalPrice: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  lines: z.array(z.object({
    tenderItemId: z.string().uuid(),
    unitPrice: z.number().nonnegative().max(1_000_000_000),
  })).max(100).default([]),
}).superRefine((bid, context) => {
  if (bid.totalPrice == null && bid.lines.length === 0) {
    context.addIssue({ code: "custom", path: ["totalPrice"], message: "Enter a total bid or at least one item price" });
  }
  if (new Set(bid.lines.map((line) => line.tenderItemId)).size !== bid.lines.length) {
    context.addIssue({ code: "custom", path: ["lines"], message: "Each tender item may only have one price per bid" });
  }
  if (bid.isOurCompany && bid.competitorId) {
    context.addIssue({ code: "custom", path: ["competitorId"], message: "Our company cannot be selected as a competitor" });
  }
});

const tenderReadingSchema = z.object({
  readingDate: z.coerce.date(),
  method: z.enum(["CALL", "VISIT"]),
  notes: z.string().trim().max(2000).optional().nullable(),
  bids: z.array(readingBidSchema).min(1).max(100),
});

const resultInclude = {
  readings: {
    include: {
      reportedBy: { select: { id: true, fullName: true } },
      bids: {
        include: {
          competitor: { select: { id: true, name: true } },
          lines: { include: { tenderItem: { select: { id: true, description: true, unit: true } } } },
          history: {
            include: { editedBy: { select: { id: true, fullName: true } } },
            orderBy: { changedAt: "desc" as const },
          },
        },
      },
    },
    orderBy: { readingDate: "desc" as const },
  },
  expectedBidders: {
    include: { competitor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  awards: {
    include: {
      lines: {
        include: {
          tenderItem: { select: { id: true, description: true, quantity: true, unit: true } },
          winnerCompetitor: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { awardedAt: "desc" as const },
  },
  purchaseOrders: {
    include: {
      quotation: { select: { id: true, version: true, status: true, totalAmount: true } },
      lines: { include: { tenderItem: { select: { id: true, description: true, quantity: true, unit: true } } } },
      documents: { select: { id: true, fileName: true, contentType: true, createdAt: true } },
    },
    orderBy: { poDate: "desc" as const },
  },
} satisfies Prisma.TenderInclude;

app.get(
  "/api/tenders/:id/results",
  requireAuth,
  tenderReaderRoles,
  route(async (request, response) => {
    const tenderId = paramId(request);
    const tender = await findAccessibleTender(tenderId, request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    const [results, competitors, company] = await Promise.all([
      prisma.tender.findUniqueOrThrow({ where: { id: tenderId }, include: resultInclude }),
      prisma.competitor.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.companyProfile.findUnique({ where: { id: "default" }, select: { companyName: true } }),
    ]);
    response.json({ ...results, competitors, companyName: company?.companyName ?? "Our company" });
  }),
);

app.post(
  "/api/tenders/:id/readings",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  route(async (request, response) => {
    const input = tenderReadingSchema.parse(request.body);
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (!["SUBMITTED", "TENDER_READING_DONE"].includes(tender.status)) {
      response.status(400).json({ error: "Tender readings can only be recorded after tender submission" });
      return;
    }
    if (input.bids.some((bid) => bid.lines.some((line) => !tender.items.some((item) => item.id === line.tenderItemId)))) {
      response.status(400).json({ error: "Reading prices must refer to items from this tender" });
      return;
    }
    const ownBids = input.bids.filter((bid) => bid.isOurCompany);
    if (ownBids.length > 1) {
      response.status(400).json({ error: "A tender reading can contain only one bid from our company" });
      return;
    }
    const created = await prisma.$transaction(async (transaction) => {
      const reading = await transaction.tenderReading.create({
        data: {
          tenderId: tender.id,
          readingDate: input.readingDate,
          method: input.method,
          reportedById: request.user!.id,
          notes: input.notes,
          bids: {
            create: await Promise.all(input.bids.map(async (bid) => {
              let competitorId = bid.competitorId ?? null;
              let companyName = bid.companyName;
              if (bid.isOurCompany) {
                competitorId = null;
                companyName = (await transaction.companyProfile.findUnique({
                  where: { id: "default" },
                  select: { companyName: true },
                }))?.companyName ?? bid.companyName;
              } else if (competitorId) {
                const competitor = await transaction.competitor.findFirst({
                  where: { id: competitorId, active: true },
                  select: { id: true, name: true },
                });
                if (!competitor) throw new RequestValidationError("Select an active competitor");
                companyName = competitor.name;
              } else {
                const existing = await transaction.competitor.findFirst({
                  where: { name: { equals: companyName, mode: "insensitive" } },
                  select: { id: true, name: true, active: true },
                });
                if (existing?.active) {
                  competitorId = existing.id;
                  companyName = existing.name;
                } else if (!existing) {
                  const competitor = await transaction.competitor.create({ data: { name: companyName } });
                  competitorId = competitor.id;
                } else {
                  throw new RequestValidationError("Reactivate this competitor before recording its bid");
                }
              }
              return {
                competitorId,
                companyName,
                isOurCompany: bid.isOurCompany,
                totalPrice: bid.totalPrice,
                lines: { create: bid.lines },
              };
            })),
          },
        },
        include: resultInclude.readings.include,
      });
      if (tender.status !== "TENDER_READING_DONE") {
        await transaction.tender.update({ where: { id: tender.id }, data: { status: "TENDER_READING_DONE" } });
      }
      await transaction.notification.deleteMany({
        where: { type: "TENDER_READING_OVERDUE", referenceId: tender.id },
      });
      await writeAudit(transaction, request.user?.id, "CREATE", "TenderReading", reading.id, {
        tenderId: tender.id,
        bidCount: input.bids.length,
      });
      return reading;
    });
    response.status(201).json(created);
  }),
);

app.put(
  "/api/reading-bids/:id",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  route(async (request, response) => {
    const bidId = paramId(request);
    const input = readingBidSchema.parse(request.body);
    const existing = await prisma.readingBid.findUnique({
      where: { id: bidId },
      include: { reading: true, lines: true },
    });
    const tender = existing ? await findAccessibleTender(existing.reading.tenderId, request.user!) : null;
    if (!existing || !tender) {
      response.status(404).json({ error: "Reading bid not found" });
      return;
    }
    if (!["SUBMITTED", "TENDER_READING_DONE"].includes(tender.status)) {
      response.status(400).json({ error: "Reading bids can only be corrected before an award is recorded" });
      return;
    }
    const tenderItemIds = await prisma.tenderItem.findMany({
      where: { tenderId: existing.reading.tenderId },
      select: { id: true },
    });
    if (input.lines.some((line) => !tenderItemIds.some((item) => item.id === line.tenderItemId))) {
      response.status(400).json({ error: "Reading prices must refer to items from this tender" });
      return;
    }
    if (input.isOurCompany && input.competitorId) {
      response.status(400).json({ error: "Our company cannot be selected as a competitor" });
      return;
    }
    if (input.isOurCompany && await prisma.readingBid.findFirst({
      where: { readingId: existing.readingId, isOurCompany: true, id: { not: existing.id } },
      select: { id: true },
    })) {
      response.status(400).json({ error: "A tender reading can contain only one bid from our company" });
      return;
    }
    const saved = await prisma.$transaction(async (transaction) => {
      const history = {
        competitorId: existing.competitorId,
        companyName: existing.companyName,
        isOurCompany: existing.isOurCompany,
        totalPrice: existing.totalPrice?.toString() ?? null,
        lines: existing.lines.map((line) => ({ tenderItemId: line.tenderItemId, unitPrice: line.unitPrice.toString() })),
      };
      await transaction.readingBidHistory.create({
        data: { readingBidId: existing.id, editedById: request.user!.id, previousData: history },
      });
      let competitorId = input.isOurCompany ? null : input.competitorId ?? null;
      let companyName = input.companyName;
      if (!input.isOurCompany && competitorId) {
        const competitor = await transaction.competitor.findFirst({
          where: { id: competitorId, active: true },
          select: { name: true },
        });
        if (!competitor) throw new RequestValidationError("Select an active competitor");
        companyName = competitor.name;
      }
      const updated = await transaction.readingBid.update({
        where: { id: existing.id },
        data: {
          competitorId,
          companyName,
          isOurCompany: input.isOurCompany,
          totalPrice: input.totalPrice,
          lines: { deleteMany: {}, create: input.lines },
        },
        include: {
          competitor: { select: { id: true, name: true } },
          lines: true,
          history: { include: { editedBy: { select: { id: true, fullName: true } } }, orderBy: { changedAt: "desc" } },
        },
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "ReadingBid", updated.id, { readingId: existing.readingId });
      return updated;
    });
    response.json(saved);
  }),
);

app.post(
  "/api/tenders/:id/expected-bidders",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  route(async (request, response) => {
    const { competitorId } = z.object({ competitorId: z.string().uuid() }).parse(request.body);
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (["CANCELLED", "COMPLETED"].includes(tender.status)) {
      response.status(400).json({ error: "Expected bidders cannot be changed after the tender is closed" });
      return;
    }
    const competitor = await prisma.competitor.findFirst({ where: { id: competitorId, active: true } });
    if (!competitor) {
      response.status(400).json({ error: "Select an active competitor" });
      return;
    }
    const existingBidder = await prisma.tenderExpectedBidder.findUnique({
      where: { tenderId_competitorId: { tenderId: tender.id, competitorId } },
      select: { competitorId: true },
    });
    if (existingBidder) {
      response.status(409).json({ error: "This competitor is already on the expected bidder list" });
      return;
    }
    const bidder = await prisma.$transaction(async (transaction) => {
      const created = await transaction.tenderExpectedBidder.create({
        data: { tenderId: tender.id, competitorId },
        include: { competitor: { select: { id: true, name: true } } },
      });
      await writeAudit(transaction, request.user?.id, "ADD_EXPECTED_BIDDER", "Tender", tender.id, { competitorId });
      return created;
    });
    response.status(201).json(bidder);
  }),
);

app.delete(
  "/api/tenders/:id/expected-bidders/:competitorId",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  route(async (request, response) => {
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (["CANCELLED", "COMPLETED"].includes(tender.status)) {
      response.status(400).json({ error: "Expected bidders cannot be changed after the tender is closed" });
      return;
    }
    const competitorId = z.string().uuid().parse(request.params.competitorId);
    await prisma.$transaction(async (transaction) => {
      await transaction.tenderExpectedBidder.delete({ where: { tenderId_competitorId: { tenderId: tender.id, competitorId } } });
      await writeAudit(transaction, request.user?.id, "REMOVE_EXPECTED_BIDDER", "Tender", tender.id, { competitorId });
    });
    response.status(204).end();
  }),
);

const awardInputSchema = z.object({
  type: z.enum(["WHOLE", "ITEM_WISE"]),
  awardedAt: z.coerce.date(),
  reason: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(z.object({
    tenderItemId: z.string().uuid(),
    winnerCompetitorId: z.string().uuid().optional().nullable(),
    wonByUs: z.boolean(),
    quantity: z.number().positive().max(1_000_000),
    unitPrice: z.number().nonnegative().max(1_000_000_000),
    lossReason: z.enum(["PRICE", "SPECIFICATION", "DELIVERY", "BOND", "DISQUALIFICATION", "OTHER"]).optional().nullable(),
  })).min(1).max(100),
});

app.post(
  "/api/tenders/:id/awards",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  route(async (request, response) => {
    const input = awardInputSchema.parse(request.body);
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (!canRecordAward(tender.status)) {
      response.status(400).json({ error: "Awards can only be recorded before the tender is closed" });
      return;
    }
    const itemIds = tender.items.map((item) => item.id);
    if (input.lines.some((line) => !itemIds.includes(line.tenderItemId)) ||
      new Set(input.lines.map((line) => line.tenderItemId)).size !== input.lines.length) {
      response.status(400).json({ error: "Award each tender item at most once using items from this tender" });
      return;
    }
    if (input.type === "WHOLE" && input.lines.length !== tender.items.length) {
      response.status(400).json({ error: "A whole-tender award must include every tender item" });
      return;
    }
    if (input.lines.some((line) => line.wonByUs && line.winnerCompetitorId ||
      !line.wonByUs && !line.winnerCompetitorId ||
      !line.wonByUs && !line.lossReason)) {
      response.status(400).json({ error: "Select a competitor and loss reason for lost items; our company cannot be a competitor" });
      return;
    }
    if (input.type === "WHOLE" && input.lines.some((line) =>
      line.wonByUs !== input.lines[0].wonByUs || line.winnerCompetitorId !== input.lines[0].winnerCompetitorId)) {
      response.status(400).json({ error: "A whole-tender award must have the same winner for every item" });
      return;
    }
    if (input.type === "WHOLE" && (tender.status === "AWARDED" || tender.status === "LOST")) {
      response.status(400).json({ error: "A whole-tender award has already been recorded; use item-wise awards for remaining items" });
      return;
    }
    const award = await prisma.$transaction(async (transaction) => {
      const previousLines = await transaction.tenderAwardLine.findMany({
        where: { award: { tenderId: tender.id } },
        select: { tenderItemId: true, quantity: true, wonByUs: true },
      });
      if (input.type === "WHOLE" && previousLines.length > 0) {
        throw new RequestValidationError("A whole-tender award can only be recorded once");
      }
      for (const line of input.lines) {
        const tenderItem = tender.items.find((item) => item.id === line.tenderItemId)!;
        const previouslyAwarded = previousLines
          .filter((previous) => previous.tenderItemId === line.tenderItemId)
          .reduce((sum, previous) => sum + Number(previous.quantity), 0);
        if (previouslyAwarded + line.quantity > Number(tenderItem.quantity) + 1e-8) {
          throw new RequestValidationError(`Awarded quantity cannot exceed the requested quantity for item ${line.tenderItemId}`);
        }
      }
      const competitorIds = [...new Set(input.lines.flatMap((line) => line.winnerCompetitorId ? [line.winnerCompetitorId] : []))];
      const competitors = await transaction.competitor.findMany({
        where: { id: { in: competitorIds }, active: true },
        select: { id: true, name: true },
      });
      if (competitors.length !== competitorIds.length) throw new RequestValidationError("Select active competitors for awarded items");
      const companyName = (await transaction.companyProfile.findUnique({
        where: { id: "default" },
        select: { companyName: true },
      }))?.companyName ?? "Our company";
      const byId = new Map(competitors.map((competitor) => [competitor.id, competitor.name]));
      const created = await transaction.tenderAward.create({
        data: {
          tenderId: tender.id,
          type: input.type,
          awardedAt: input.awardedAt,
          reason: input.reason,
          lines: {
            create: input.lines.map((line) => ({
              tenderItemId: line.tenderItemId,
              winnerCompetitorId: line.winnerCompetitorId ?? null,
              winnerName: line.wonByUs ? companyName : byId.get(line.winnerCompetitorId!)!,
              wonByUs: line.wonByUs,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lossReason: line.wonByUs ? null : line.lossReason,
            })),
          },
        },
        include: { lines: { include: { tenderItem: true, winnerCompetitor: true } } },
      });
      const status = tender.status === "PO_RECEIVED"
        ? "PO_RECEIVED"
        : previousLines.some((line) => line.wonByUs) || input.lines.some((line) => line.wonByUs)
          ? "AWARDED"
          : "LOST";
      await transaction.tender.update({ where: { id: tender.id }, data: { status } });
      await writeAudit(transaction, request.user?.id, "RECORD_AWARD", "TenderAward", created.id, { tenderId: tender.id, status });
      return created;
    });
    response.status(201).json(award);
  }),
);

const purchaseOrderInputSchema = z.object({
  quotationId: z.string().uuid().optional().nullable(),
  poNumber: z.string().trim().min(1).max(100),
  poDate: z.coerce.date(),
  deliveryDate: z.coerce.date().optional().nullable(),
  terms: z.string().trim().max(2000).optional().nullable(),
  paymentTerms: z.string().trim().max(1000).optional().nullable(),
  documentUrl: z.string().url().max(2000).optional().nullable(),
  invoiceNumber: z.string().trim().max(100).optional().nullable(),
  lines: z.array(z.object({
    tenderItemId: z.string().uuid(),
    quantity: z.number().positive().max(1_000_000),
    unitPrice: z.number().nonnegative().max(1_000_000_000),
  })).min(1).max(100),
  performanceBondRequired: z.boolean().default(false),
  performanceBondAmount: z.number().positive().max(1_000_000_000).optional().nullable(),
  performanceBondBank: z.string().refine(isSriLankaBankCode, "Select a valid Sri Lankan bank.").optional().nullable(),
  performanceBondNumber: z.string().trim().max(100).optional().nullable(),
  performanceBondIssueDate: z.coerce.date().optional().nullable(),
  performanceBondExpiryDate: z.coerce.date().optional().nullable(),
  performanceBondStatus: z.enum(["NOT_REQUIRED", "REQUESTED", "ISSUED", "SUBMITTED", "RETURNED", "EXPIRED"]).optional(),
});

app.post(
  "/api/tenders/:id/purchase-orders",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  route(async (request, response) => {
    const input = purchaseOrderInputSchema.parse(request.body);
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (!["AWARDED", "PO_RECEIVED"].includes(tender.status)) {
      response.status(400).json({ error: "An award is required before recording a purchase order" });
      return;
    }
    if (new Set(input.lines.map((line) => line.tenderItemId)).size !== input.lines.length ||
      input.lines.some((line) => !tender.items.some((item) => item.id === line.tenderItemId))) {
      response.status(400).json({ error: "Purchase order lines must use unique items from this tender" });
      return;
    }
    const purchaseOrder = await prisma.$transaction(async (transaction) => {
      if (input.quotationId) {
        const quotation = await transaction.quotation.findFirst({
          where: { id: input.quotationId, tenderId: tender.id, status: "APPROVED" },
          select: { id: true },
        });
        if (!quotation) throw new RequestValidationError("Select an approved quotation for this tender");
      }
      const awardLines = await transaction.tenderAwardLine.findMany({
        where: { award: { tenderId: tender.id }, wonByUs: true, tenderItemId: { in: input.lines.map((line) => line.tenderItemId) } },
        select: { tenderItemId: true, quantity: true },
      });
      const existingLines = await transaction.purchaseOrderLine.findMany({
        where: { purchaseOrder: { tenderId: tender.id }, tenderItemId: { in: input.lines.map((line) => line.tenderItemId) } },
        select: { tenderItemId: true, quantity: true },
      });
      for (const line of input.lines) {
        const awarded = awardLines.filter((awardLine) => awardLine.tenderItemId === line.tenderItemId)
          .reduce((sum, awardLine) => sum + Number(awardLine.quantity), 0);
        const alreadyOrdered = existingLines.filter((orderLine) => orderLine.tenderItemId === line.tenderItemId)
          .reduce((sum, orderLine) => sum + Number(orderLine.quantity), 0);
        if (awarded <= alreadyOrdered || line.quantity > awarded - alreadyOrdered) {
          throw new RequestValidationError("Purchase order quantities cannot exceed the remaining quantity awarded to our company");
        }
      }
      if (input.performanceBondRequired && !input.performanceBondAmount) {
        throw new RequestValidationError("Enter the performance bond amount");
      }
      if (input.performanceBondRequired && input.performanceBondStatus === "NOT_REQUIRED" ||
        !input.performanceBondRequired && input.performanceBondStatus && input.performanceBondStatus !== "NOT_REQUIRED") {
        throw new RequestValidationError("Performance bond status must match whether a bond is required");
      }
      const created = await transaction.purchaseOrder.create({
        data: {
          tenderId: tender.id,
          quotationId: input.quotationId,
          poNumber: input.poNumber,
          poDate: input.poDate,
          deliveryDate: input.deliveryDate,
          terms: input.terms,
          paymentTerms: input.paymentTerms,
          documentUrl: input.documentUrl,
          invoiceNumber: input.invoiceNumber,
          performanceBondRequired: input.performanceBondRequired,
          performanceBondAmount: input.performanceBondRequired ? input.performanceBondAmount : null,
          performanceBondBank: input.performanceBondRequired ? input.performanceBondBank : null,
          performanceBondNumber: input.performanceBondRequired ? input.performanceBondNumber : null,
          performanceBondIssueDate: input.performanceBondRequired ? input.performanceBondIssueDate : null,
          performanceBondExpiryDate: input.performanceBondRequired ? input.performanceBondExpiryDate : null,
          performanceBondStatus: input.performanceBondRequired ? input.performanceBondStatus ?? "REQUESTED" : "NOT_REQUIRED",
          lines: { create: input.lines },
        },
        include: {
          quotation: { select: { id: true, version: true, status: true, totalAmount: true } },
          lines: { include: { tenderItem: true } },
        },
      });
      await transaction.tender.update({ where: { id: tender.id }, data: { status: "PO_RECEIVED" } });
      await writeAudit(transaction, request.user?.id, "RECORD_PURCHASE_ORDER", "PurchaseOrder", created.id, { tenderId: tender.id });
      return created;
    });
    response.status(201).json(purchaseOrder);
  }),
);

app.patch(
  "/api/purchase-orders/:id",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  route(async (request, response) => {
    const input = z.object({
      deliveryStatus: z.enum(["PENDING", "PARTIAL", "DELIVERED"]).optional(),
      invoiceNumber: z.string().trim().max(100).optional().nullable(),
      paymentReceived: z.boolean().optional(),
      performanceBondStatus: z.enum(["NOT_REQUIRED", "REQUESTED", "ISSUED", "SUBMITTED", "RETURNED", "EXPIRED"]).optional(),
    }).refine((value) => Object.keys(value).length > 0).parse(request.body);
    const id = paramId(request);
    const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
    const tender = existing ? await findAccessibleTender(existing.tenderId, request.user!) : null;
    if (!existing || !tender) {
      response.status(404).json({ error: "Purchase order not found" });
      return;
    }
    if (["CANCELLED", "COMPLETED"].includes(tender.status)) {
      response.status(400).json({ error: "Purchase orders cannot be changed after the tender is closed" });
      return;
    }
    if (input.performanceBondStatus && !existing.performanceBondRequired && input.performanceBondStatus !== "NOT_REQUIRED") {
      response.status(400).json({ error: "This purchase order does not require a performance bond" });
      return;
    }
    if (input.performanceBondStatus === "NOT_REQUIRED" && existing.performanceBondRequired) {
      response.status(400).json({ error: "A required performance bond cannot be marked as not required" });
      return;
    }
    const updated = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.purchaseOrder.update({
        where: { id },
        data: input,
        include: { quotation: { select: { id: true, version: true, status: true, totalAmount: true } }, lines: { include: { tenderItem: true } } },
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "PurchaseOrder", id, input);
      return saved;
    });
    response.json(updated);
  }),
);

app.post(
  "/api/purchase-orders/:id/documents",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  businessDocumentUpload,
  route(async (request, response) => {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: paramId(request) },
      select: { id: true, poNumber: true, tenderId: true },
    });
    const tender = purchaseOrder ? await findAccessibleTender(purchaseOrder.tenderId, request.user!) : null;
    if (!purchaseOrder || !tender) {
      response.status(404).json({ error: "Purchase order not found" });
      return;
    }
    const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
    const data = validatedDocumentData(request, contentType);
    const fileName = documentFileName(request.query.fileName);
    const document = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.purchaseOrderDocument.create({
        data: { purchaseOrderId: purchaseOrder.id, fileName, contentType, data },
        select: { id: true, fileName: true, contentType: true, createdAt: true },
      });
      await writeAudit(transaction, request.user?.id, "UPLOAD", "PurchaseOrderDocument", saved.id, {
        purchaseOrderId: purchaseOrder.id,
        poNumber: purchaseOrder.poNumber,
        fileName: saved.fileName,
      });
      return saved;
    });
    response.status(201).json(document);
  }),
);

app.get(
  "/api/purchase-orders/:id/documents/:documentId",
  requireAuth,
  tenderReaderRoles,
  route(async (request, response) => {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: paramId(request) },
      select: { id: true, tenderId: true },
    });
    const tender = purchaseOrder ? await findAccessibleTender(purchaseOrder.tenderId, request.user!) : null;
    const document = purchaseOrder && tender
      ? await prisma.purchaseOrderDocument.findFirst({
          where: { id: paramId(request, "documentId"), purchaseOrderId: purchaseOrder.id },
        })
      : null;
    if (!document) {
      response.status(404).json({ error: "Purchase order document not found" });
      return;
    }
    sendDocument(response, document);
  }),
);

app.delete(
  "/api/purchase-orders/:id/documents/:documentId",
  requireAuth,
  requireCsrf,
  resultsEditorRoles,
  route(async (request, response) => {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: paramId(request) },
      select: { id: true, poNumber: true, tenderId: true },
    });
    const tender = purchaseOrder ? await findAccessibleTender(purchaseOrder.tenderId, request.user!) : null;
    const document = purchaseOrder && tender
      ? await prisma.purchaseOrderDocument.findFirst({
          where: { id: paramId(request, "documentId"), purchaseOrderId: purchaseOrder.id },
          select: { id: true, fileName: true },
        })
      : null;
    if (!document || !purchaseOrder) {
      response.status(404).json({ error: "Purchase order document not found" });
      return;
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.purchaseOrderDocument.delete({ where: { id: document.id } });
      await writeAudit(transaction, request.user?.id, "DELETE", "PurchaseOrderDocument", document.id, {
        purchaseOrderId: purchaseOrder.id,
        poNumber: purchaseOrder.poNumber,
        fileName: document.fileName,
      });
    });
    response.status(204).end();
  }),
);

app.post(
  "/api/tenders/:id/complete",
  requireAuth,
  requireCsrf,
  allowRoles("ADMIN", "DIRECTOR", "TENDER_MANAGER"),
  route(async (request, response) => {
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (tender.status !== "PO_RECEIVED") {
      response.status(400).json({ error: "Only tenders with recorded purchase orders can be completed" });
      return;
    }
    const [orders, awardLines, purchaseOrderLines] = await Promise.all([
      prisma.purchaseOrder.findMany({ where: { tenderId: tender.id } }),
      prisma.tenderAwardLine.findMany({
        where: { award: { tenderId: tender.id } },
        select: { tenderItemId: true, quantity: true, wonByUs: true },
      }),
      prisma.purchaseOrderLine.findMany({
        where: { purchaseOrder: { tenderId: tender.id } },
        select: { tenderItemId: true, quantity: true },
      }),
    ]);
    if (!hasCompleteAwardCoverage(
      tender.items.map((item) => ({ id: item.id, quantity: Number(item.quantity) })),
      awardLines.map((line) => ({ tenderItemId: line.tenderItemId, quantity: Number(line.quantity) })),
    )) {
      response.status(400).json({ error: "Record an award or loss for every requested item quantity before completing the tender" });
      return;
    }
    if (!areWonAwardQuantitiesOrdered(
      awardLines.map((line) => ({ ...line, quantity: Number(line.quantity), wonByUs: line.wonByUs })),
      purchaseOrderLines.map((line) => ({ tenderItemId: line.tenderItemId, quantity: Number(line.quantity) })),
    )) {
      response.status(400).json({ error: "Record purchase orders for all quantities awarded to your company before completing the tender" });
      return;
    }
    if (!orders.length || orders.some((order) =>
      order.deliveryStatus !== "DELIVERED" || !order.paymentReceived ||
      order.performanceBondRequired && !["RETURNED", "EXPIRED"].includes(order.performanceBondStatus))) {
      response.status(400).json({ error: "All purchase orders must be delivered and paid, and required performance bonds returned or expired" });
      return;
    }
    const completed = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.tender.update({ where: { id: tender.id }, data: { status: "COMPLETED" } });
      await writeAudit(transaction, request.user?.id, "COMPLETE", "Tender", tender.id);
      return updated;
    });
    response.json(completed);
  }),
);

const quotationInputSchema = z.object({
  validityDays: z.number().int().min(1).max(365).optional(),
  discountAmount: z.number().nonnegative().default(0),
  terms: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(z.object({
    tenderItemId: z.string().uuid(),
    pricingMethod: z.enum(["PERCENTAGE", "DIRECT"]),
    costBaseMethod: z.enum(["LOWEST", "AVERAGE", "SELECTED"]),
    supplierPriceId: z.string().uuid().optional().nullable(),
    marginPercent: z.number().min(0).max(1000).optional().nullable(),
    directUnitPrice: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
    transportCost: z.number().nonnegative().max(1_000_000_000).default(0),
    installationCost: z.number().nonnegative().max(1_000_000_000).default(0),
    bondCost: z.number().nonnegative().max(1_000_000_000).default(0),
    commissionCost: z.number().nonnegative().max(1_000_000_000).default(0),
  })).min(1).max(100),
});

app.post(
  "/api/tenders/:id/quotations",
  requireAuth,
  requireCsrf,
  quotationRoles,
  route(async (request, response) => {
    if (!request.user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    const hasCostAccess = canViewPricingCosts(request.user);
    const input = quotationInputSchema.parse(request.body);
    const tender = await prisma.tender.findFirst({
      where: {
        id: paramId(request),
        ...await tenderAccessWhere(request.user),
      },
      include: { items: { include: { supplierPrices: true } } },
    });
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (!isPreSubmissionStatus(tender.status)) {
      response.status(400).json({ error: "A quotation can only be created before tender submission" });
      return;
    }
    if (input.lines.length !== tender.items.length || new Set(input.lines.map((line) => line.tenderItemId)).size !== tender.items.length ||
      input.lines.some((line) => !tender.items.some((item) => item.id === line.tenderItemId))) {
      response.status(400).json({ error: "Create a price for every tender item exactly once" });
      return;
    }

    const company = await prisma.companyProfile.findUnique({ where: { id: "default" } });
    const vatRate = Number(company?.vatRate ?? 0);
    const validityDays = input.validityDays ?? company?.quotationValidityDays ?? 30;
    const calculatedLines = input.lines.map((line) => {
      const tenderItem = tender.items.find((item) => item.id === line.tenderItemId)!;
      const currentPrices = tenderItem.supplierPrices.filter((price) => isSupplierPriceCurrent(price.validUntil));
      if (!currentPrices.length) {
        throw new RequestValidationError(`Record a current supplier price before pricing ${tenderItem.description}`);
      }
      const sortedPrices = [...currentPrices].sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice));
      let supplierPrice: typeof currentPrices[number] | undefined;
      if (!hasCostAccess) {
        if (line.pricingMethod !== "DIRECT") {
          throw new RequestValidationError("Enter a selling price without supplier-cost pricing details.");
        }
        supplierPrice = sortedPrices[0];
      } else if (line.costBaseMethod === "SELECTED") {
        supplierPrice = currentPrices.find((price) => price.id === line.supplierPriceId);
      } else {
        if (line.costBaseMethod === "LOWEST") supplierPrice = sortedPrices[0];
      }
      if (hasCostAccess && line.costBaseMethod === "SELECTED" && !supplierPrice) {
        throw new RequestValidationError(`Select a valid supplier price for ${tenderItem.description}`);
      }
      const baseUnitCost = hasCostAccess && line.costBaseMethod === "AVERAGE"
        ? roundMoney(currentPrices.reduce((sum, price) => sum + Number(price.unitPrice), 0) / currentPrices.length)
        : Number(supplierPrice?.unitPrice ?? 0);
      const transportCost = hasCostAccess ? line.transportCost : 0;
      const installationCost = hasCostAccess ? line.installationCost : 0;
      const bondCost = hasCostAccess ? line.bondCost : 0;
      const commissionCost = hasCostAccess ? line.commissionCost : 0;
      const pricingMethod = hasCostAccess ? line.pricingMethod : "DIRECT";
      const costBaseMethod = hasCostAccess ? line.costBaseMethod : "LOWEST";
      const marginPercent = hasCostAccess && line.pricingMethod === "PERCENTAGE" ? line.marginPercent : null;
      const extras = roundMoney(transportCost + installationCost + bondCost + commissionCost);
      const totalUnitCost = roundMoney(baseUnitCost + extras);
      if (hasCostAccess && line.pricingMethod === "PERCENTAGE" && line.marginPercent == null) {
        throw new RequestValidationError(`Enter a margin percentage for ${tenderItem.description}`);
      }
      if ((!hasCostAccess || line.pricingMethod === "DIRECT") && line.directUnitPrice == null) {
        throw new RequestValidationError(`Enter a direct selling price for ${tenderItem.description}`);
      }
      const sellingUnitPrice = roundMoney(hasCostAccess && line.pricingMethod === "PERCENTAGE"
        ? totalUnitCost * (1 + Number(line.marginPercent) / 100)
        : Number(line.directUnitPrice));
      const lineSubtotal = roundMoney(sellingUnitPrice * Number(tenderItem.quantity));
      const grossProfit = roundMoney((sellingUnitPrice - totalUnitCost) * Number(tenderItem.quantity));
      return {
        tenderItemId: tenderItem.id,
        pricingMethod,
        costBaseMethod,
        supplierPriceId: supplierPrice?.id,
        baseUnitCost,
        transportCost,
        installationCost,
        bondCost,
        commissionCost,
        marginPercent,
        quantity: Number(tenderItem.quantity),
        sellingUnitPrice,
        lineSubtotal,
        grossProfit,
      };
    });
    const subtotal = roundMoney(calculatedLines.reduce((sum, line) => sum + line.lineSubtotal, 0));
    if (input.discountAmount > subtotal) {
      response.status(400).json({ error: "Discount cannot be greater than the quotation subtotal" });
      return;
    }
    const taxableAmount = roundMoney(subtotal - input.discountAmount);
    const vatAmount = roundMoney(taxableAmount * vatRate / 100);
    const totalAmount = roundMoney(taxableAmount + vatAmount);
    const grossProfit = roundMoney(calculatedLines.reduce((sum, line) => sum + line.grossProfit, 0) - input.discountAmount);
    const minimumMargin = Number(company?.minimumMarginPercent ?? 0);
    const minimumMarginWarnings = calculatedLines.flatMap((line) => {
      const cost = line.baseUnitCost + line.transportCost + line.installationCost + line.bondCost + line.commissionCost;
      const margin = cost > 0 ? (line.sellingUnitPrice - cost) / cost * 100 : 0;
      const item = tender.items.find((row) => row.id === line.tenderItemId)!;
      return cost > 0 && margin < minimumMargin ? [{ item: item.description, marginPercent: roundMoney(margin) }] : [];
    });

    const quotation = await prisma.$transaction(async (transaction) => {
      const latest = await transaction.quotation.findFirst({
        where: { tenderId: tender.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const created = await transaction.quotation.create({
        data: {
          tenderId: tender.id,
          version: (latest?.version ?? 0) + 1,
          validityDays,
          vatRate,
          discountAmount: input.discountAmount,
          subtotal,
          vatAmount,
          totalAmount,
          grossProfit,
          terms: input.terms,
          createdById: request.user!.id,
          lines: { create: calculatedLines },
        },
        include: {
          lines: { include: { tenderItem: true, supplierPrice: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      });
      await transaction.tender.update({ where: { id: tender.id }, data: { status: "QUOTED" } });
      await writeAudit(transaction, request.user?.id, "CREATE", "Quotation", created.id, {
        tenderId: tender.id,
        version: created.version,
        totalAmount,
      });
      return created;
    });
    response.status(201).json({
      ...(hasCostAccess ? quotation : redactQuotationCosts(quotation)),
      minimumMarginWarnings: hasCostAccess ? minimumMarginWarnings : [],
    });
  }),
);

app.post(
  "/api/quotations/:id/submit",
  requireAuth,
  requireCsrf,
  quotationRoles,
  route(async (request, response) => {
    const quotation = await prisma.quotation.findUnique({ where: { id: paramId(request) } });
    if (!quotation || (request.user?.role === "SALES_REP" && quotation.createdById !== request.user.id)) {
      response.status(404).json({ error: "Quotation not found" });
      return;
    }
    if (quotation.status !== "DRAFT") {
      response.status(400).json({ error: "This quotation cannot be submitted by the current user" });
      return;
    }
    const updated = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.quotation.update({
        where: { id: quotation.id },
        data: { status: "PENDING_TENDER_MANAGER", submittedForApprovalAt: new Date(), rejectionReason: null },
      });
      await transaction.notification.deleteMany({
        where: {
          referenceId: quotation.id,
          type: { in: ["QUOTATION_PENDING_MANAGER", "QUOTATION_PENDING_DIRECTOR"] },
        },
      });
      await writeAudit(transaction, request.user?.id, "SUBMIT_FOR_APPROVAL", "Quotation", saved.id);
      return saved;
    });
    response.json(updated);
  }),
);

app.post(
  "/api/quotations/:id/approve",
  requireAuth,
  requireCsrf,
  quotationApproverRoles,
  route(async (request, response) => {
    const quotation = await prisma.quotation.findUnique({ where: { id: paramId(request) } });
    if (!quotation || !request.user) {
      response.status(404).json({ error: "Quotation not found" });
      return;
    }
    const isAdmin = request.user.role === "ADMIN";
    let update: Prisma.QuotationUpdateInput;
    let action: string;
    if (quotation.status === "PENDING_TENDER_MANAGER" && (isAdmin || request.user.role === "TENDER_MANAGER")) {
      if (quotation.createdById === request.user.id && !isAdmin) {
        response.status(403).json({ error: "You cannot approve your own quotation" });
        return;
      }
      update = { status: "PENDING_DIRECTOR", managerApprovedBy: { connect: { id: request.user.id } }, managerApprovedAt: new Date() };
      action = "MANAGER_APPROVE";
    } else if (quotation.status === "PENDING_DIRECTOR" && (isAdmin || request.user.role === "DIRECTOR")) {
      if (quotation.createdById === request.user.id && !isAdmin) {
        response.status(403).json({ error: "You cannot approve your own quotation" });
        return;
      }
      update = { status: "APPROVED", directorApprovedBy: { connect: { id: request.user.id } }, directorApprovedAt: new Date() };
      action = "DIRECTOR_APPROVE";
    } else {
      response.status(400).json({ error: "This quotation is not awaiting approval from your role" });
      return;
    }
    const saved = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.quotation.update({ where: { id: quotation.id }, data: update });
      await transaction.notification.deleteMany({
        where: {
          type: quotation.status === "PENDING_TENDER_MANAGER" ? "QUOTATION_PENDING_MANAGER" : "QUOTATION_PENDING_DIRECTOR",
          referenceId: quotation.id,
        },
      });
      await writeAudit(transaction, request.user?.id, action, "Quotation", updated.id);
      return updated;
    });
    response.json(saved);
  }),
);

app.post(
  "/api/quotations/:id/reject",
  requireAuth,
  requireCsrf,
  quotationApproverRoles,
  route(async (request, response) => {
    const { reason } = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(request.body);
    const quotation = await prisma.quotation.findUnique({ where: { id: paramId(request) } });
    if (!quotation || !request.user) {
      response.status(404).json({ error: "Quotation not found" });
      return;
    }
    if (!["PENDING_TENDER_MANAGER", "PENDING_DIRECTOR"].includes(quotation.status)) {
      response.status(400).json({ error: "Only a quotation awaiting approval can be rejected" });
      return;
    }
    if (quotation.status === "PENDING_TENDER_MANAGER" && request.user.role === "DIRECTOR" ||
      quotation.status === "PENDING_DIRECTOR" && request.user.role === "TENDER_MANAGER") {
      response.status(403).json({ error: "Your role cannot reject at this approval step" });
      return;
    }
    const saved = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.quotation.update({
        where: { id: quotation.id },
        data: { status: "REJECTED", rejectionReason: reason },
      });
      await transaction.notification.deleteMany({
        where: {
          referenceId: quotation.id,
          type: { in: ["QUOTATION_PENDING_MANAGER", "QUOTATION_PENDING_DIRECTOR"] },
        },
      });
      await writeAudit(transaction, request.user?.id, "REJECT", "Quotation", updated.id, { reason });
      return updated;
    });
    response.json(saved);
  }),
);

app.post(
  "/api/tenders/:id/submit",
  requireAuth,
  requireCsrf,
  tenderEditorRoles,
  route(async (request, response) => {
    const tender = await findAccessibleTender(paramId(request), request.user!);
    if (!tender) {
      response.status(404).json({ error: "Tender not found" });
      return;
    }
    if (!isPreSubmissionStatus(tender.status)) {
      response.status(400).json({ error: "Only a tender awaiting submission can be marked as submitted" });
      return;
    }
    const approved = await prisma.quotation.findFirst({ where: { tenderId: tender.id, status: "APPROVED" } });
    if (!approved) {
      response.status(400).json({ error: "A director-approved quotation is required before submission" });
      return;
    }
    const updated = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.tender.update({ where: { id: tender.id }, data: { status: "SUBMITTED" } });
      await transaction.notification.deleteMany({ where: { type: "TENDER_CLOSING", referenceId: tender.id } });
      await writeAudit(transaction, request.user?.id, "SUBMIT", "Tender", saved.id);
      return saved;
    });
    response.json(updated);
  }),
);

const competitorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(1000).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  contactNumber: z.string().trim().max(40).optional().nullable(),
  contactPerson: z.string().trim().max(150).optional().nullable(),
  province: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

app.get(
  "/api/competitors",
  requireAuth,
  route(async (_request, response) => {
    response.json(await prisma.competitor.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }));
  }),
);

app.post(
  "/api/competitors",
  requireAuth,
  requireCsrf,
  managerRoles,
  route(async (request, response) => {
    const competitor = await prisma.$transaction(async (transaction) => {
      const created = await transaction.competitor.create({ data: competitorSchema.parse(request.body) });
      await writeAudit(transaction, request.user?.id, "CREATE", "Competitor", created.id);
      return created;
    });
    response.status(201).json(competitor);
  }),
);

app.put(
  "/api/competitors/:id",
  requireAuth,
  requireCsrf,
  managerRoles,
  route(async (request, response) => {
    const competitor = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.competitor.update({
        where: { id: paramId(request) },
        data: competitorSchema.parse(request.body),
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "Competitor", updated.id);
      return updated;
    });
    response.json(competitor);
  }),
);

app.delete(
  "/api/competitors/:id",
  requireAuth,
  requireCsrf,
  managerRoles,
  route(async (request, response) => {
    const competitor = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.competitor.update({
        where: { id: paramId(request) },
        data: { active: false },
      });
      await writeAudit(transaction, request.user?.id, "DEACTIVATE", "Competitor", updated.id);
      return updated;
    });
    response.json(competitor);
  }),
);

const institutionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(1000).optional().nullable(),
  province: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().max(100).optional().nullable(),
  contactNumber1: z.string().trim().max(40).optional().nullable(),
  contactNumber2: z.string().trim().max(40).optional().nullable(),
  contactPerson: z.string().trim().max(150).optional().nullable(),
});

app.get(
  "/api/institutions",
  requireAuth,
  route(async (_request, response) => {
    response.json(await prisma.institution.findMany({ orderBy: { name: "asc" } }));
  }),
);

app.post(
  "/api/institutions",
  requireAuth,
  requireCsrf,
  registrationRoles,
  route(async (request, response) => {
    const institution = await prisma.$transaction(async (transaction) => {
      const created = await transaction.institution.create({ data: institutionSchema.parse(request.body) });
      await writeAudit(transaction, request.user?.id, "CREATE", "Institution", created.id);
      return created;
    });
    response.status(201).json(institution);
  }),
);

const registrationSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  registrationFee: z.number().min(0),
  bondAmount: z.number().min(0).default(0),
  registrationDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  notes: z.string().trim().max(2000).optional().nullable(),
  itemIds: z.array(z.string().uuid()).default([]),
});

function withRegistrationStatus<T extends { expiryDate: Date; renewals?: unknown[] }>(record: T) {
  const daysUntilExpiry = Math.ceil((record.expiryDate.getTime() - Date.now()) / 86_400_000);
  const hasRenewal = Boolean(record.renewals?.length);
  const status = hasRenewal ? "RENEWED" : daysUntilExpiry < 0 ? "EXPIRED" : daysUntilExpiry <= 60 ? "EXPIRING_SOON" : "ACTIVE";
  return { ...record, daysUntilExpiry, status };
}

app.get(
  "/api/registrations",
  requireAuth,
  route(async (_request, response) => {
    const records = await prisma.registration.findMany({
      include: {
        institution: true,
        items: { include: { item: true } },
        payments: {
          orderBy: { paymentDate: "desc" },
          include: { documents: { select: { id: true, type: true, fileName: true, contentType: true, updatedAt: true } } },
        },
        renewals: { select: { id: true } },
      },
      orderBy: [{ expiryDate: "asc" }, { institution: { name: "asc" } }],
    });
    response.json(records.map(withRegistrationStatus));
  }),
);

const paymentDocumentTypes = ["CHEQUE_IMAGE", "RECEIPT_COPY"] as const;
const paymentDocumentMimeTypes = supportedDocumentMimeTypes;
const paymentDocumentUpload = express.raw({
  type: [...paymentDocumentMimeTypes],
  limit: "5mb",
});

function isValidPaymentDocument(data: Buffer, contentType: string): boolean {
  return validDocumentContent(data, contentType);
}

app.put(
  "/api/registration-payments/:paymentId/documents/:type",
  requireAuth,
  requireCsrf,
  registrationRoles,
  paymentDocumentUpload,
  route(async (request, response) => {
    const paymentId = paramId(request, "paymentId");
    const type = z.enum(paymentDocumentTypes).parse(request.params.type);
    const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!paymentDocumentMimeTypes.includes(contentType as (typeof paymentDocumentMimeTypes)[number])) {
      throw new RequestValidationError("Upload a PDF, JPEG, PNG, or WebP document");
    }
    if (!Buffer.isBuffer(request.body) || request.body.length === 0 || !isValidPaymentDocument(request.body, contentType)) {
      throw new RequestValidationError("The uploaded file is empty or does not match its file type");
    }
    const rawFileName = z.string().min(1).max(255).parse(request.query.fileName);
    const fileName = rawFileName.replace(/\\/g, "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!fileName) throw new RequestValidationError("A valid file name is required");

    const document = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.registrationPaymentDocument.upsert({
        where: { paymentId_type: { paymentId, type } },
        create: {
          paymentId,
          type,
          fileName: fileName.slice(0, 180),
          contentType,
          data: request.body,
        },
        update: {
          fileName: fileName.slice(0, 180),
          contentType,
          data: request.body,
          updatedAt: new Date(),
        },
        select: { id: true, type: true, fileName: true, contentType: true, updatedAt: true },
      });
      await writeAudit(transaction, request.user?.id, "UPLOAD", "RegistrationPaymentDocument", saved.id, {
        paymentId,
        type,
        fileName: saved.fileName,
      });
      return saved;
    });
    response.status(200).json(document);
  }),
);

app.get(
  "/api/registration-payments/:paymentId/documents/:type",
  requireAuth,
  registrationRoles,
  route(async (request, response) => {
    const paymentId = paramId(request, "paymentId");
    const type = z.enum(paymentDocumentTypes).parse(request.params.type);
    const document = await prisma.registrationPaymentDocument.findUnique({
      where: { paymentId_type: { paymentId, type } },
    });
    if (!document) {
      response.status(404).json({ error: "Payment document not found" });
      return;
    }
    response.set({
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      "Content-Type": document.contentType,
      "X-Content-Type-Options": "nosniff",
    });
    response.send(document.data);
  }),
);

app.delete(
  "/api/registration-payments/:paymentId/documents/:type",
  requireAuth,
  requireCsrf,
  registrationRoles,
  route(async (request, response) => {
    const paymentId = paramId(request, "paymentId");
    const type = z.enum(paymentDocumentTypes).parse(request.params.type);
    await prisma.$transaction(async (transaction) => {
      const document = await transaction.registrationPaymentDocument.findUnique({
        where: { paymentId_type: { paymentId, type } },
        select: { id: true },
      });
      if (!document) {
        response.status(404).json({ error: "Payment document not found" });
        return;
      }
      await transaction.registrationPaymentDocument.delete({ where: { id: document.id } });
      await writeAudit(transaction, request.user?.id, "DELETE", "RegistrationPaymentDocument", document.id, { paymentId, type });
    });
    if (!response.headersSent) response.status(204).end();
  }),
);

app.post(
  "/api/institutions/:institutionId/registrations",
  requireAuth,
  requireCsrf,
  registrationRoles,
  route(async (request, response) => {
    const input = registrationSchema.parse(request.body);
    if (input.expiryDate <= input.registrationDate) {
      response.status(400).json({ error: "Expiry date must be after registration date" });
      return;
    }
    const record = await prisma.$transaction(async (transaction) => {
      const created = await transaction.registration.create({
        data: {
          institutionId: paramId(request, "institutionId"),
          year: input.year,
          registrationFee: input.registrationFee,
          bondAmount: input.bondAmount,
          registrationDate: input.registrationDate,
          expiryDate: input.expiryDate,
          notes: input.notes,
          items: { create: input.itemIds.map((itemId) => ({ itemId })) },
        },
        include: { institution: true, items: { include: { item: true } }, payments: true, renewals: true },
      });
      await writeAudit(transaction, request.user?.id, "CREATE", "Registration", created.id);
      return created;
    });
    response.status(201).json(withRegistrationStatus(record));
  }),
);

app.post(
  "/api/registrations/:id/renew",
  requireAuth,
  requireCsrf,
  registrationRoles,
  route(async (request, response) => {
    const input = registrationSchema.parse(request.body);
    const previous = await prisma.registration.findUnique({
      where: { id: paramId(request) },
      include: { items: true },
    });
    if (!previous) {
      response.status(404).json({ error: "Registration not found" });
      return;
    }
    if (input.year <= previous.year) {
      response.status(400).json({ error: "Renewal year must be later than the previous registration year" });
      return;
    }
    if (input.expiryDate <= input.registrationDate) {
      response.status(400).json({ error: "Expiry date must be after registration date" });
      return;
    }
    const itemIds = request.body.itemIds === undefined
      ? previous.items.map((row) => row.itemId)
      : input.itemIds;
    const renewal = await prisma.$transaction(async (transaction) => {
      const created = await transaction.registration.create({
        data: {
          institutionId: previous.institutionId,
          year: input.year,
          registrationFee: input.registrationFee,
          bondAmount: input.bondAmount,
          registrationDate: input.registrationDate,
          expiryDate: input.expiryDate,
          notes: input.notes,
          renewedFromId: previous.id,
          items: { create: itemIds.map((itemId) => ({ itemId })) },
        },
        include: {
          institution: true,
          items: { include: { item: true } },
          payments: true,
          renewals: true,
        },
      });
      await writeAudit(transaction, request.user?.id, "RENEW", "Registration", created.id, { renewedFromId: previous.id });
      await transaction.notification.deleteMany({ where: { referenceId: previous.id } });
      return created;
    });
    response.status(201).json(withRegistrationStatus(renewal));
  }),
);

const paymentSchema = z.object({
  mode: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"]),
  amount: z.number().positive(),
  paymentDate: z.coerce.date(),
  reference: z.string().trim().max(150).optional().nullable(),
  bank: z.string().trim().max(150).optional().nullable(),
  paidBy: z.string().trim().max(150).optional().nullable(),
});

app.post(
  "/api/registrations/:id/payments",
  requireAuth,
  requireCsrf,
  registrationRoles,
  route(async (request, response) => {
    const payment = await prisma.$transaction(async (transaction) => {
      const created = await transaction.registrationPayment.create({
        data: {
          registrationId: paramId(request),
          ...paymentSchema.parse(request.body),
        },
      });
      await writeAudit(transaction, request.user?.id, "CREATE", "RegistrationPayment", created.id);
      return created;
    });
    response.status(201).json(payment);
  }),
);

const roles = ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS"] as const;
const roleNames = z.enum(roles);

function assertRolePermissions(baseRole: AuthUser["role"], permissions: string[]): void {
  const allowedPermissions = baseRolePermissions[baseRole];
  if (permissions.some((permission) =>
    !permissionCatalog.some((definition) => definition.id === permission) ||
    !allowedPermissions.includes(permission))) {
    throw new RequestValidationError("Custom role permissions must be a subset of the selected base role.");
  }
}

async function resolveUserRole(selection: string): Promise<{ role: AuthUser["role"]; customRoleId: string | null }> {
  if (!selection.startsWith("custom:")) {
    return { role: roleNames.parse(selection), customRoleId: null };
  }
  const customRoleId = z.string().uuid().parse(selection.slice("custom:".length));
  const customRole = await prisma.customRole.findUnique({
    where: { id: customRoleId },
    select: { id: true, baseRole: true },
  });
  if (!customRole) throw new RequestValidationError("Select an existing custom role.");
  return { role: customRole.baseRole, customRoleId: customRole.id };
}

app.get(
  "/api/roles",
  requireAuth,
  adminOnly,
  route(async (_request, response) => {
    const customRoles = await prisma.customRole.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true } } },
    });
    response.json({ builtInRoles: roles, permissionCatalog, customRoles });
  }),
);

const customRoleInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  baseRole: roleNames,
  permissions: z.array(z.string()).max(permissionCatalog.length),
});

app.post(
  "/api/roles",
  requireAuth,
  requireCsrf,
  adminOnly,
  route(async (request, response) => {
    const input = customRoleInputSchema.parse(request.body);
    assertRolePermissions(input.baseRole, input.permissions);
    const customRole = await prisma.$transaction(async (transaction) => {
      const created = await transaction.customRole.create({
        data: { ...input, permissions: input.permissions },
      });
      await writeAudit(transaction, request.user?.id, "CREATE", "CustomRole", created.id, {
        baseRole: created.baseRole,
        permissions: input.permissions,
      });
      return created;
    });
    response.status(201).json(customRole);
  }),
);

app.patch(
  "/api/roles/:id",
  requireAuth,
  requireCsrf,
  adminOnly,
  route(async (request, response) => {
    const input = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      permissions: z.array(z.string()).max(permissionCatalog.length).optional(),
    }).refine((value) => Object.keys(value).length > 0).parse(request.body);
    const id = paramId(request);
    const existing = await prisma.customRole.findUnique({ where: { id } });
    if (!existing) {
      response.status(404).json({ error: "Custom role not found" });
      return;
    }
    if (input.permissions) assertRolePermissions(existing.baseRole, input.permissions);
    const updated = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.customRole.update({
        where: { id },
        data: input,
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "CustomRole", id, {
        ...(input.name ? { name: input.name } : {}),
        ...(input.permissions ? { permissions: input.permissions } : {}),
      });
      return saved;
    });
    response.json(updated);
  }),
);

app.delete(
  "/api/roles/:id",
  requireAuth,
  requireCsrf,
  adminOnly,
  route(async (request, response) => {
    const id = paramId(request);
    const assignedUsers = await prisma.user.count({ where: { customRoleId: id } });
    if (assignedUsers > 0) {
      response.status(409).json({ error: "Reassign users before deleting this role." });
      return;
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.customRole.delete({ where: { id } });
      await writeAudit(transaction, request.user?.id, "DELETE", "CustomRole", id);
    });
    response.status(204).end();
  }),
);

app.get(
  "/api/users",
  requireAuth,
  adminOnly,
  route(async (_request, response) => {
    const users = await prisma.user.findMany({
      include: { customRole: true, areaAssignments: true },
      orderBy: { fullName: "asc" },
    });
    response.json(users.map(userView));
  }),
);

app.post(
  "/api/users",
  requireAuth,
  requireCsrf,
  adminOnly,
  route(async (request, response) => {
    const input = z.object({
      fullName: z.string().trim().min(1).max(150),
      email: z.string().email().transform((email) => email.toLowerCase()),
      password: z.string().min(12).max(200),
      role: z.string().min(1).max(100),
      areaAssignments: z.array(z.object({
        province: z.string().trim().min(1).max(100),
        district: z.string().trim().max(100).default(""),
      })).max(25).default([]),
    }).parse(request.body);
    const assignment = await resolveUserRole(input.role);
    const areaAssignments = validateAreaAssignments(input.areaAssignments, assignment.role);
    const user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          role: assignment.role,
          customRoleId: assignment.customRoleId,
          passwordHash: await bcrypt.hash(input.password, 12),
          areaAssignments: { create: areaAssignments },
        },
        include: { customRole: true, areaAssignments: true },
      });
      await writeAudit(transaction, request.user?.id, "CREATE", "User", created.id, {
        role: assignment.role,
        customRoleId: assignment.customRoleId,
        areaAssignments,
      });
      return created;
    });
    response.status(201).json(userView(user));
  }),
);

app.patch(
  "/api/users/:id",
  requireAuth,
  requireCsrf,
  adminOnly,
  route(async (request, response) => {
    const input = z.object({
      role: z.string().min(1).max(100).optional(),
      active: z.boolean().optional(),
      fullName: z.string().trim().min(1).max(150).optional(),
      email: z.string().email().transform((email) => email.toLowerCase()).optional(),
      password: z.string().min(12).max(200).optional(),
      areaAssignments: z.array(z.object({
        province: z.string().trim().min(1).max(100),
        district: z.string().trim().max(100).default(""),
      })).max(25).optional(),
    }).refine((value) => Object.keys(value).length > 0).parse(request.body);
    const userId = paramId(request);
    const assignment = input.role ? await resolveUserRole(input.role) : undefined;
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, customRoleId: true, active: true },
    });
    if (!target) {
      response.status(404).json({ error: "User not found" });
      return;
    }
    const targetRole = assignment?.role ?? target.role;
    const areaAssignments = input.areaAssignments === undefined
      ? undefined
      : validateAreaAssignments(input.areaAssignments, targetRole);
    const clearAreaAssignments = areaAssignments !== undefined ||
      assignment !== undefined && assignment.role !== "SALES_REP";
    if (input.password && userId === request.user?.id) {
      response.status(400).json({ error: "Use the Security page to change your own password" });
      return;
    }
    if (userId === request.user?.id && input.active === false) {
      response.status(400).json({ error: "You cannot deactivate your own account" });
      return;
    }
    if (input.active === false || assignment && (assignment.role !== "ADMIN" || assignment.customRoleId !== null)) {
      if (target.role === "ADMIN" && target.customRoleId === null && target.active) {
        const activeAdministrators = await prisma.user.count({
          where: { role: "ADMIN", customRoleId: null, active: true },
        });
        if (activeAdministrators <= 1) {
          response.status(400).json({ error: "The last active Administrator cannot be deactivated or demoted" });
          return;
        }
      }
    }
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;
    const user = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(passwordHash ? { passwordHash, sessionVersion: { increment: 1 } } : {}),
          ...(assignment ? { role: assignment.role, customRoleId: assignment.customRoleId } : {}),
          ...(clearAreaAssignments ? {
            areaAssignments: {
              deleteMany: {},
              ...(areaAssignments?.length ? { create: areaAssignments } : {}),
            },
          } : {}),
        },
        include: { customRole: true, areaAssignments: true },
      });
      await writeAudit(transaction, request.user?.id, "UPDATE", "User", updated.id, {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(passwordHash ? { passwordReset: true } : {}),
        ...(assignment ? { role: assignment.role, customRoleId: assignment.customRoleId } : {}),
        ...(clearAreaAssignments ? { areaAssignments: areaAssignments ?? [] } : {}),
      });
      return updated;
    });
    response.json(userView(user));
  }),
);

app.get(
  "/api/notifications",
  requireAuth,
  route(async (request, response) => {
    response.json(await prisma.notification.findMany({
      where: { OR: [{ recipientId: request.user!.id }, { recipientId: null }] },
      orderBy: { createdAt: "desc" },
      take: 500,
    }));
  }),
);

app.post(
  "/api/notifications/:id/acknowledge",
  requireAuth,
  requireCsrf,
  route(async (request, response) => {
    const id = paramId(request);
    const notification = await prisma.notification.findFirst({
      where: { id, recipientId: request.user!.id },
      select: { id: true },
    });
    if (!notification) {
      response.status(404).json({ error: "Notification not found" });
      return;
    }
    response.json(await prisma.notification.update({
      where: { id },
      data: { acknowledgedAt: new Date(), snoozedUntil: null },
    }));
  }),
);

app.patch(
  "/api/notifications/:id/snooze",
  requireAuth,
  requireCsrf,
  route(async (request, response) => {
    const id = paramId(request);
    const input = z.object({ snoozedUntil: z.coerce.date() }).parse(request.body);
    const now = new Date();
    if (input.snoozedUntil <= now || input.snoozedUntil > new Date(now.getTime() + 30 * 86_400_000)) {
      throw new RequestValidationError("Snooze must be set between now and 30 days from now");
    }
    const notification = await prisma.notification.findFirst({
      where: { id, recipientId: request.user!.id, acknowledgedAt: null },
      select: { id: true },
    });
    if (!notification) {
      response.status(404).json({ error: "Notification not found or already acknowledged" });
      return;
    }
    response.json(await prisma.notification.update({
      where: { id },
      data: { snoozedUntil: input.snoozedUntil },
    }));
  }),
);

app.get(
  "/api/audit-logs",
  requireAuth,
  allowRoles("ADMIN", "DIRECTOR"),
  route(async (request, response) => {
    const logs = await prisma.auditLog.findMany({
      include: { actor: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(request.query.limit) || 100, 500),
    });
    response.json(logs);
  }),
);

const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (typeof error === "object" && error !== null && "status" in error && error.status === 413) {
    response.status(413).json({
      error: request.path.startsWith("/api/registration-payments")
        ? "Each payment document must be 5 MB or smaller"
        : "Each tender or purchase order document must be 20 MB or smaller",
    });
    return;
  }
  if (error instanceof RequestValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.issues });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    response.status(409).json({ error: "A record with the same unique value already exists" });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  ) {
    response.status(404).json({ error: "Record not found" });
    return;
  }
  console.error("API request failed", error);
  response.status(500).json({ error: "An unexpected server error occurred" });
};

app.use(errorHandler);

export default app;
