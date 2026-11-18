import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import "./App.css";
import { createXlsxWorkbook } from "./xlsxExport";
import { MAX_ITEM_IMPORT_ROWS, readXlsxRows } from "./xlsxImport";

type Role = "ADMIN" | "DIRECTOR" | "TENDER_MANAGER" | "SALES_REP" | "COSTING" | "ACCOUNTS";
type User = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active?: boolean;
  customRoleId?: string | null;
  customRoleName?: string | null;
  permissions?: string[];
  areaAssignments?: { province: string; district: string | null }[];
};
type PermissionDefinition = { id: string; module: string; action: string; label: string; roles: Role[] };
type CustomRole = { id: string; name: string; baseRole: Role; permissions: string[]; _count: { users: number } };
type RoleAdminData = { builtInRoles: Role[]; permissionCatalog: PermissionDefinition[]; customRoles: CustomRole[] };
type ItemCategory = { id: string; name: string; active: boolean };
type Brand = { id: string; name: string; active: boolean };
type Unit = { id: string; name: string; abbreviation: string; active: boolean };
type Item = {
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  category: ItemCategory | null;
  brandId: string | null;
  brand: Brand | null;
  modelSpecification: string | null;
  unitId: string;
  unit: Unit;
  warrantyMonths: number | null;
  active: boolean;
};
type Competitor = {
  id: string;
  name: string;
  contactPerson: string | null;
  contactNumber: string | null;
  email?: string | null;
  address?: string | null;
  province: string | null;
  district: string | null;
  active: boolean;
};
type Supplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
};
type Institution = { id: string; name: string; province: string | null; district: string | null };
type Area = { province: string; districts: string[] };
type SriLankaBank = { code: string; name: string };
type PaymentDocumentType = "CHEQUE_IMAGE" | "RECEIPT_COPY";
type RegistrationPaymentDocument = {
  id: string;
  type: PaymentDocumentType;
  fileName: string;
  contentType: string;
  updatedAt: string;
};
type FileAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  createdAt: string;
  type?: "TENDER_DOCUMENT" | "ADDENDUM" | "OTHER";
};
type Registration = {
  id: string;
  year: number;
  registrationFee: string;
  bondAmount: string;
  registrationDate: string;
  expiryDate: string;
  status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "RENEWED";
  daysUntilExpiry: number;
  institution: Institution;
  items: { item: Item }[];
  payments: {
    id: string;
    amount: string;
    mode: string;
    paymentDate: string;
    reference: string | null;
    documents: RegistrationPaymentDocument[];
  }[];
};
type SupplierPrice = {
  id: string;
  supplierId: string;
  supplierName: string;
  unitPrice: string;
  givenBy: string | null;
  receivedAt: string;
  validUntil: string | null;
  notes: string | null;
  requestedBy: { id: string; fullName: string };
};
type TenderLine = {
  id: string;
  itemId: string | null;
  description: string;
  specification: string | null;
  quantity: string;
  unit: string;
  estimatedUnitPrice: string | null;
  hasCurrentSupplierPrice?: boolean;
  item: Item | null;
  supplierPrices: SupplierPrice[];
};
type QuotationLine = {
  id: string;
  tenderItemId: string;
  pricingMethod: "PERCENTAGE" | "DIRECT" | null;
  costBaseMethod: "LOWEST" | "AVERAGE" | "SELECTED" | null;
  supplierPriceId: string | null;
  baseUnitCost: string | null;
  transportCost: string | null;
  installationCost: string | null;
  bondCost: string | null;
  commissionCost: string | null;
  marginPercent: string | null;
  quantity: string;
  sellingUnitPrice: string;
  lineSubtotal: string;
  grossProfit: string | null;
  tenderItem: TenderLine;
  supplierPrice: SupplierPrice | null;
};
type Quotation = {
  id: string;
  version: number;
  createdAt: string;
  status: "DRAFT" | "PENDING_TENDER_MANAGER" | "PENDING_DIRECTOR" | "APPROVED" | "REJECTED";
  validityDays: number;
  vatRate: string;
  discountAmount: string;
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
  grossProfit: string | null;
  terms: string | null;
  createdById: string;
  createdBy: { id: string; fullName: string };
  rejectionReason: string | null;
  managerApprovedBy: { id: string; fullName: string } | null;
  directorApprovedBy: { id: string; fullName: string } | null;
  lines: QuotationLine[];
};
type TenderRecord = {
  id: string;
  tenderNumber: number;
  referenceNumber: string;
  type: "OPEN" | "LETTERS" | "WALK_IN";
  status: string;
  institutionId: string;
  institution: Institution;
  source: string | null;
  letterReceivedAt: string | null;
  visitAt: string | null;
  contactOfficer: string | null;
  closingAt: string;
  province: string | null;
  district: string | null;
  responsibleRepId: string;
  responsibleRep: { id: string; fullName: string; email: string };
  bidBondRequired: boolean;
  bidBondAmount: string | null;
  bidBondBank: string | null;
  bidBondNumber: string | null;
  bidBondIssueDate: string | null;
  bidBondExpiryDate: string | null;
  bidBondStatus: string | null;
  notes: string | null;
  items: TenderLine[];
  documents: FileAttachment[];
  quotations: Quotation[];
  registrationWarning: boolean;
  company?: CompanyProfile | null;
};
type ReadingBid = {
  id: string;
  companyName: string;
  isOurCompany: boolean;
  totalPrice: string | null;
  competitor: { id: string; name: string } | null;
  lines: { id: string; tenderItemId: string; unitPrice: string; tenderItem: { id: string; description: string; unit: string } }[];
  history: {
    id: string;
    changedAt: string;
    editedBy: { id: string; fullName: string };
    previousData: { companyName: string; isOurCompany: boolean; totalPrice: string | null; lines: { tenderItemId: string; unitPrice: string }[] };
  }[];
};
type TenderReading = {
  id: string;
  readingDate: string;
  method: "CALL" | "VISIT";
  notes: string | null;
  reportedBy: { id: string; fullName: string };
  bids: ReadingBid[];
};
type TenderAwardLine = {
  id: string;
  tenderItemId: string;
  winnerName: string;
  wonByUs: boolean;
  quantity: string;
  unitPrice: string;
  lossReason: string | null;
  tenderItem: { id: string; description: string; quantity: string; unit: string };
  winnerCompetitor: { id: string; name: string } | null;
};
type TenderAward = { id: string; type: "WHOLE" | "ITEM_WISE"; awardedAt: string; reason: string | null; lines: TenderAwardLine[] };
type PurchaseOrder = {
  id: string;
  poNumber: string;
  poDate: string;
  deliveryDate: string | null;
  terms: string | null;
  paymentTerms: string | null;
  documentUrl: string | null;
  deliveryStatus: "PENDING" | "PARTIAL" | "DELIVERED";
  invoiceNumber: string | null;
  paymentReceived: boolean;
  performanceBondRequired: boolean;
  performanceBondAmount: string | null;
  performanceBondBank: string | null;
  performanceBondNumber: string | null;
  performanceBondExpiryDate: string | null;
  performanceBondStatus: "NOT_REQUIRED" | "REQUESTED" | "ISSUED" | "SUBMITTED" | "RETURNED" | "EXPIRED";
  documents: FileAttachment[];
  quotation: { id: string; version: number; status: string; totalAmount: string } | null;
  lines: { id: string; tenderItemId: string; quantity: string; unitPrice: string; tenderItem: { id: string; description: string; quantity: string; unit: string } }[];
};
type TenderResults = {
  readings: TenderReading[];
  expectedBidders: { competitor: { id: string; name: string } }[];
  awards: TenderAward[];
  purchaseOrders: PurchaseOrder[];
  competitors: { id: string; name: string }[];
  companyName: string;
};
type Notice = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  recipientId: string | null;
  acknowledgedAt: string | null;
  snoozedUntil: string | null;
};
type Dashboard = {
  counts: { activeItems: number; competitors: number; registrations: number; expiredRegistrations: number };
  notifications: Notice[];
  closingToday: number;
  closingThisWeek: number;
  registrationExpiryWithinWeek: number;
};
type TenderReport = {
  generatedAt: string;
  truncated: boolean;
  totalMatching: number;
  summary: {
    tenderCount: number;
    wonCount: number;
    lostCount: number;
    winRate: number;
    awardedValue: number;
    purchaseOrderValue: number;
    deliveredOrders: number;
    pendingDeliveryOrders: number;
    unpaidOrders: number;
    outstandingBonds: number;
  };
  byRepresentative: { id: string; name: string; tenderCount: number; wonCount: number; lostCount: number; awardedValue: number }[];
  byInstitution: { id: string; name: string; tenderCount: number; wonCount: number; lostCount: number; awardedValue: number }[];
  byArea: { province: string; district: string; tenderCount: number; wonCount: number; lostCount: number; awardedValue: number; purchaseOrderValue: number }[];
  competitors: { id: string | null; name: string; bids: number; averageBid: number; lowestBidCount: number }[];
  tenders: {
    id: string; referenceNumber: string; status: string; closingAt: string;
    province: string; district: string;
    institution: { name: string }; responsibleRep: { id: string; fullName: string };
    awardedValue: number; purchaseOrderValue: number; purchaseOrders: {
      poNumber: string; deliveryStatus: string; paymentReceived: boolean;
      performanceBondRequired: boolean; performanceBondStatus: string;
    }[];
  }[];
};
type PricePrediction = {
  id: string;
  status: "READY" | "INSUFFICIENT_DATA";
  modelVersion: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  totalReadingCount: number;
  winningSampleCount: number;
  competitorSampleCount: number;
  reasons: string[];
  predictedPriceRange: { low: number | null; mostLikely: number | null; high: number | null } | null;
  targetWinProbability: number | null;
  chosenBidPrice: number | null;
  chosenWinProbability: number | null;
  recommendedBidPrice: number | null;
  currentUnitCost: number | null;
  customerEstimatedUnitPrice: number | null;
  averageOwnPastBid: number | null;
  ownPastBidCount: number;
  expectedGrossProfit: number | null;
  recommendedGrossProfit: number | null;
  profitNote: string;
  supportingTenders: {
    tenderId: string;
    referenceNumber: string;
    institutionName: string;
    closingAt: string;
    awardedUnitPrice: number;
    competitorLowestUnitPrice: number | null;
  }[];
  adjustmentNote: string;
};
type PredictionAccuracy = {
  evaluatedCount: number;
  meanAbsolutePercentageError: number | null;
  records: {
    id: string;
    tenderReference: string;
    itemDescription: string;
    predictedPrice: number;
    actualPrice: number;
    errorPercent: number;
    predictionDate: string;
  }[];
};
type CompanyProfile = {
  companyName: string;
  address: string;
  email: string;
  officePhone1: string;
  officePhone2: string | null;
  brNumber: string;
  vatRegistrationNumber: string;
  quotationValidityDays: number;
  vatRate: string | number;
  minimumMarginPercent: string | number | null;
  theme: BusinessTheme;
};
type BusinessTheme = "forest" | "ocean" | "plum";
type Page = "dashboard" | "reports" | "items" | "competitors" | "institutions" | "registrations" | "tenders" | "categories" | "brands" | "units" | "suppliers" | "company" | "users" | "roles" | "notifications" | "security";
type DataRow = Item | Competitor | Registration | Institution | User | Notice;
type MasterKind = "categories" | "brands" | "units";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const roleLabels: Record<Role, string> = {
  ADMIN: "Administrator",
  DIRECTOR: "Director",
  TENDER_MANAGER: "Tender Manager",
  SALES_REP: "Sales Rep",
  COSTING: "Costing / Procurement",
  ACCOUNTS: "Accounts",
};
const businessThemeLabels: Record<BusinessTheme, string> = {
  forest: "Forest green",
  ocean: "Ocean blue",
  plum: "Plum",
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  csrfToken?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

async function searchItemOptions(query: string): Promise<Item[]> {
  return request<Item[]>(`/api/items/search?q=${encodeURIComponent(query)}&limit=50`);
}

async function uploadPaymentDocument(
  paymentId: string,
  type: PaymentDocumentType,
  file: File,
  csrfToken?: string,
): Promise<RegistrationPaymentDocument> {
  const headers = new Headers({ "Content-Type": file.type });
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(
    `${API_BASE}/api/registration-payments/${paymentId}/documents/${type}?fileName=${encodeURIComponent(file.name)}`,
    { method: "PUT", headers, body: file, credentials: "include" },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `Document upload failed (${response.status})`;
    throw new Error(message);
  }
  return body as RegistrationPaymentDocument;
}

async function uploadBusinessDocument(
  path: string,
  file: File,
  csrfToken?: string,
  type?: string,
): Promise<void> {
  const query = new URLSearchParams({ fileName: file.name });
  if (type) query.set("type", type);
  const headers = new Headers({ "Content-Type": file.type });
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(`${API_BASE}${path}?${query}`, {
    method: "POST",
    headers,
    body: file,
    credentials: "include",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : `Document upload failed (${response.status})`;
    throw new Error(message);
  }
}

async function downloadBusinessDocument(path: string, fileName: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : `Document download failed (${response.status})`;
    throw new Error(message);
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function currency(value: string | number): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function bankLabel(code: string | null, banks: SriLankaBank[]): string {
  if (!code) return "Bank not entered";
  const bank = banks.find((candidate) => candidate.code === code);
  return bank ? `${bank.name} (${bank.code})` : code;
}

function isSupplierPriceCurrent(validUntil: string | null): boolean {
  if (!validUntil) return true;
  const offsetMs = 330 * 60 * 1000;
  const validThrough = new Date(new Date(validUntil).getTime() + offsetMs).toISOString().slice(0, 10);
  const today = new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
  return validThrough >= today;
}

function getTenderNextStep(tender: TenderRecord, results: TenderResults | null, currentUser: User): {
  tone: "blue" | "red";
  title: string;
  message: string;
} {
  const preSubmission = ["NEW", "PRICE_REQUESTED", "QUOTED"].includes(tender.status);
  const canPrepareQuotation = currentUser.permissions?.includes("quotations.prepare")
    ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP"].includes(currentUser.role);
  const canSubmitTender = currentUser.permissions?.includes("tenders.submit")
    ?? ["ADMIN", "TENDER_MANAGER", "SALES_REP"].includes(currentUser.role);
  const canManageSupplierPrices = currentUser.permissions?.includes("supplierPrices.manage")
    ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "COSTING"].includes(currentUser.role);
  const canManageReadings = currentUser.permissions?.includes("readings.manage")
    ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS"].includes(currentUser.role);
  const canManageAwards = currentUser.permissions?.includes("awards.manage")
    ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS"].includes(currentUser.role);
  const canManagePurchaseOrders = currentUser.permissions?.includes("purchaseOrders.manage")
    ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS"].includes(currentUser.role);
  const missingPrices = tender.items.filter((item) =>
    !item.hasCurrentSupplierPrice && !item.supplierPrices.some((price) => isSupplierPriceCurrent(price.validUntil)));

  if (preSubmission && missingPrices.length > 0) {
    const itemNames = missingPrices.slice(0, 3).map((item) => item.description).join(", ");
    const moreItems = missingPrices.length > 3 ? ` and ${missingPrices.length - 3} more` : "";
    return {
      tone: "red",
      title: "Prices are needed before the quotation",
      message: `${canManageSupplierPrices ? "Add current supplier prices" : "Ask a user with supplier-price access to add current prices"} for ${itemNames}${moreItems}. An expected bidder is only a tracking entry; it does not advance the tender.`,
    };
  }

  if (preSubmission) {
    const latest = tender.quotations[0];
    if (!latest) {
      return {
        tone: canPrepareQuotation ? "blue" : "red",
        title: "Next: prepare a quotation",
        message: canPrepareQuotation
          ? "Prepare a quotation for every tender item, then submit it for Tender Manager and Director approval."
          : "Ask a user with quotation-preparation access to prepare and submit a quotation for approval.",
      };
    }
    if (latest.status === "DRAFT") {
      return {
        tone: latest.createdById === currentUser.id && !canPrepareQuotation ? "red" : "blue",
        title: "Next: submit the quotation for approval",
        message: latest.createdById !== currentUser.id
          ? `Quotation V${latest.version} is a draft. Ask its creator to submit it for approval.`
          : canPrepareQuotation
            ? `Submit quotation V${latest.version} for Tender Manager and Director approval.`
            : "Your role cannot submit this quotation. Ask a user with quotation-preparation access to submit it.",
      };
    }
    if (latest.status === "PENDING_TENDER_MANAGER") {
      const needsDifferentApprover = latest.createdById === currentUser.id && currentUser.role === "TENDER_MANAGER";
      return {
        tone: "blue",
        title: "Next: Tender Manager approval",
        message: needsDifferentApprover
          ? "This quotation needs approval from a different Tender Manager or an Admin."
          : "The quotation is waiting for Tender Manager approval.",
      };
    }
    if (latest.status === "PENDING_DIRECTOR") {
      const needsDifferentApprover = latest.createdById === currentUser.id && currentUser.role === "DIRECTOR";
      return {
        tone: "blue",
        title: "Next: Director approval",
        message: needsDifferentApprover
          ? "This quotation needs approval from a different Director or an Admin."
          : "The quotation is waiting for Director approval.",
      };
    }
    if (latest.status === "REJECTED") {
      return {
        tone: "red",
        title: "The quotation was rejected",
        message: `${latest.rejectionReason ? `${latest.rejectionReason} ` : ""}Prepare a revised quotation and submit it for approval.`,
      };
    }
    return {
      tone: canSubmitTender ? "blue" : "red",
      title: "Next: submit the tender",
      message: canSubmitTender
        ? "After sending the approved bid to the institution, select “Mark tender as submitted” to continue to tender reading."
        : "After sending the approved bid, ask a user with tender-submission access to mark it as submitted.",
    };
  }

  if (tender.status === "SUBMITTED") {
    return {
      tone: "blue",
      title: "Next: record the tender reading",
      message: canManageReadings
        ? "After the bid opening, record our bid and the competitors’ bids. Adding expected bidders alone does not move the tender to this step."
        : "After the bid opening, ask a user with tender-reading access to record our bid and the competitors’ bids.",
    };
  }
  if (tender.status === "TENDER_READING_DONE") {
    return {
      tone: "blue",
      title: "Next: record award or loss outcomes",
      message: canManageAwards
        ? "Record the winner and quantity for each item. Use item-wise awards when results differ between items."
        : "Ask a user with award-management access to record the winner and quantity for each item.",
    };
  }

  const awardLines = results?.awards.flatMap((award) => award.lines) ?? [];
  const quantities = tender.items.map((item) => {
    const itemAwards = awardLines.filter((line) => line.tenderItemId === item.id);
    const awarded = itemAwards.reduce((sum, line) => sum + Number(line.quantity), 0);
    const wonByUs = itemAwards.filter((line) => line.wonByUs)
      .reduce((sum, line) => sum + Number(line.quantity), 0);
    const ordered = results?.purchaseOrders.flatMap((order) => order.lines)
      .filter((line) => line.tenderItemId === item.id)
      .reduce((sum, line) => sum + Number(line.quantity), 0) ?? 0;
    return {
      remainingAward: Math.max(0, Number(item.quantity) - awarded),
      remainingPo: Math.max(0, wonByUs - ordered),
    };
  });
  const hasRemainingAwards = quantities.some((quantity) => quantity.remainingAward > 1e-8);
  const hasRemainingPurchaseOrders = quantities.some((quantity) => quantity.remainingPo > 1e-8);

  if (tender.status === "AWARDED" || tender.status === "LOST") {
    if (!results) {
      return { tone: "blue", title: "Next: review tender results", message: "Tender results are loading. Reopen the tender if they do not appear." };
    }
    if (hasRemainingAwards) {
      return {
        tone: "red",
        title: "Award outcomes are incomplete",
        message: "Record an award or loss for the remaining requested quantities before moving to purchase orders.",
      };
    }
    if (hasRemainingPurchaseOrders) {
      return {
        tone: "blue",
        title: "Next: record the purchase order",
        message: canManagePurchaseOrders
          ? "Record purchase orders for the remaining quantities awarded to our company."
          : "Ask a user with purchase-order access to record the quantities awarded to our company.",
      };
    }
    return tender.status === "LOST"
      ? { tone: "blue", title: "Tender recorded as lost", message: "No purchase order is expected for this result." }
      : {
        tone: "blue",
        title: "Next: record the purchase order",
        message: canManagePurchaseOrders
          ? "When received, record the purchase order for the quantity awarded to our company."
          : "When received, ask a user with purchase-order access to record the purchase order.",
      };
  }

  if (tender.status === "PO_RECEIVED") {
    if (!results) {
      return { tone: "blue", title: "Next: review purchase orders", message: "Tender results are loading. Reopen the tender if they do not appear." };
    }
    if (hasRemainingAwards) {
      return {
        tone: "red",
        title: "Award outcomes are incomplete",
        message: "Record an award or loss for every remaining requested quantity before completing the tender.",
      };
    }
    if (hasRemainingPurchaseOrders) {
      return {
        tone: "red",
        title: "Purchase orders are incomplete",
        message: canManagePurchaseOrders
          ? "Record purchase orders for all quantities awarded to our company before completing the tender."
          : "Ask a user with purchase-order access to record all quantities awarded to our company before completing.",
      };
    }
    if (results.purchaseOrders.some((order) => order.deliveryStatus !== "DELIVERED")) {
      return {
        tone: "blue",
        title: "Next: update delivery status",
        message: canManagePurchaseOrders
          ? "Update each purchase order to Delivered when its items arrive."
          : "Ask a user with purchase-order access to update each order to Delivered when its items arrive.",
      };
    }
    if (results.purchaseOrders.some((order) => !order.paymentReceived)) {
      return {
        tone: "blue",
        title: "Next: record payment",
        message: canManagePurchaseOrders
          ? "Mark payment received on each purchase order after payment is confirmed."
          : "Ask a user with purchase-order access to record payment after it is confirmed.",
      };
    }
    if (results.purchaseOrders.some((order) =>
      order.performanceBondRequired && !["RETURNED", "EXPIRED"].includes(order.performanceBondStatus))) {
      return {
        tone: "red",
        title: "Performance bond action required",
        message: canManagePurchaseOrders
          ? "Update each required performance bond to Returned or Expired before completing."
          : "Ask a user with purchase-order access to update each required bond to Returned or Expired before completing.",
      };
    }
    const canComplete = ["ADMIN", "DIRECTOR", "TENDER_MANAGER"].includes(currentUser.role)
      && (currentUser.permissions?.includes("tenders.complete") ?? true);
    return canComplete
      ? { tone: "blue", title: "Ready to complete", message: "All completion checks are satisfied. Select “Complete tender”." }
      : { tone: "blue", title: "Ready for completion", message: "All completion checks are satisfied. Ask an Admin, Director, or Tender Manager to complete the tender." };
  }

  if (tender.status === "COMPLETED") {
    return { tone: "blue", title: "Tender completed", message: "No further tender actions are required." };
  }
  if (tender.status === "CANCELLED") {
    return { tone: "red", title: "Tender cancelled", message: "This tender is closed and cannot move to another step." };
  }
  return { tone: "blue", title: "Next step", message: "Review the tender status and contact a Tender Manager if you are unsure what to do next." };
}

function paginate<T>(rows: T[], requestedPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), page, totalPages };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

function formatTenderNumber(value: number): string {
  return `TD-${String(value).padStart(8, "0")}`;
}

function App() {
  const [today] = useState(() => new Date());
  const todayInput = today.toISOString().slice(0, 10);
  const expiryInput = new Date(today.getTime() + 365 * 86_400_000).toISOString().slice(0, 10);
  const [user, setUser] = useState<User | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>();
  const [page, setPage] = useState<Page>("dashboard");
  const [administrationOpen, setAdministrationOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [banks, setBanks] = useState<SriLankaBank[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [tenders, setTenders] = useState<TenderRecord[]>([]);
  const [selectedTender, setSelectedTender] = useState<TenderRecord | null>(null);
  const [tenderResults, setTenderResults] = useState<TenderResults | null>(null);
  const [tenderResultsLoading, setTenderResultsLoading] = useState(false);
  const [tenderInstitutions, setTenderInstitutions] = useState<Institution[]>([]);
  const [tenderSuppliers, setTenderSuppliers] = useState<Supplier[]>([]);
  const [tenderReps, setTenderReps] = useState<{ id: string; fullName: string; email: string; role: Role }[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [tenderReport, setTenderReport] = useState<TenderReport | null>(null);
  const [predictionAccuracy, setPredictionAccuracy] = useState<PredictionAccuracy | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userEditorOpen, setUserEditorOpen] = useState(false);
  const [roleAdminData, setRoleAdminData] = useState<RoleAdminData>({ builtInRoles: [], permissionCatalog: [], customRoles: [] });
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [newRoleBaseRole, setNewRoleBaseRole] = useState<Role>("SALES_REP");
  const [companyEditorOpen, setCompanyEditorOpen] = useState(false);
  const [institutionEditorOpen, setInstitutionEditorOpen] = useState(false);
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [editing, setEditing] = useState<DataRow | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingSupplierPrice, setEditingSupplierPrice] = useState<SupplierPrice | null>(null);
  const [renewing, setRenewing] = useState<Registration | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [supplierEditorOpen, setSupplierEditorOpen] = useState(false);
  const [newRegistrationOpen, setNewRegistrationOpen] = useState(false);
  const [tenderCreateOpen, setTenderCreateOpen] = useState(false);
  const [payingFor, setPayingFor] = useState<Registration | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadPage = useCallback(async (target: Page = page) => {
    if (!user) return;
    await Promise.resolve();
    setPageLoading(true);
    setError("");
    try {
      switch (target) {
        case "dashboard":
          setDashboard(await request<Dashboard>("/api/dashboard"));
          break;
        case "reports":
          {
            const [report, accuracy] = await Promise.all([
              request<TenderReport>("/api/reports/tenders"),
              request<PredictionAccuracy>("/api/reports/prediction-accuracy"),
            ]);
            setTenderReport(report);
            setPredictionAccuracy(accuracy);
          }
          break;
        case "items":
          {
            const [itemList, categoryList, brandList, unitList] = await Promise.all([
              request<Item[]>("/api/items"),
              request<ItemCategory[]>("/api/item-categories"),
              request<Brand[]>("/api/brands"),
              request<Unit[]>("/api/units"),
            ]);
            setItems(itemList);
            setCategories(categoryList);
            setBrands(brandList);
            setUnits(unitList);
          }
          break;
        case "categories":
          setCategories(await request<ItemCategory[]>("/api/item-categories"));
          break;
        case "brands":
          setBrands(await request<Brand[]>("/api/brands"));
          break;
        case "units":
          setUnits(await request<Unit[]>("/api/units"));
          break;
        case "suppliers":
          setSuppliers(await request<Supplier[]>("/api/suppliers"));
          break;
        case "competitors": {
          const [competitorList, areaList] = await Promise.all([
            request<Competitor[]>("/api/competitors"),
            request<Area[]>("/api/areas"),
          ]);
          setCompetitors(competitorList);
          setAreas(areaList);
          break;
        }
        case "registrations": {
          const canManagePayments = user.permissions?.includes("registrationPayments.manage") ?? false;
          const [registrationList, institutionList, areaList, bankList] = await Promise.all([
            request<Registration[]>("/api/registrations"),
            request<Institution[]>("/api/institutions"),
            request<Area[]>("/api/areas"),
            canManagePayments ? request<SriLankaBank[]>("/api/banks") : Promise.resolve<SriLankaBank[]>([]),
          ]);
          setRegistrations(registrationList);
          setInstitutions(institutionList);
          setAreas(areaList);
          setBanks(bankList);
          break;
        }
        case "tenders": {
          const [tenderList, institutionList, areaList, repList, supplierList, bankList] = await Promise.all([
            request<TenderRecord[]>("/api/tenders"),
            request<Institution[]>("/api/institutions"),
            request<Area[]>("/api/areas"),
            request<{ id: string; fullName: string; email: string; role: Role }[]>("/api/tender-reps"),
            request<Supplier[]>("/api/tender-suppliers"),
            request<SriLankaBank[]>("/api/banks"),
          ]);
          setTenders(tenderList);
          setTenderInstitutions(institutionList);
          setAreas(areaList);
          setTenderReps(repList);
          setTenderSuppliers(supplierList);
          setBanks(bankList);
          break;
        }
        case "institutions": {
          const [institutionList, areaList] = await Promise.all([
            request<Institution[]>("/api/institutions"),
            request<Area[]>("/api/areas"),
          ]);
          setInstitutions(institutionList);
          setAreas(areaList);
          break;
        }
        case "company":
          setCompany(await request<CompanyProfile | null>("/api/company"));
          break;
        case "users": {
          const [userList, roleData, areaList] = await Promise.all([
            request<User[]>("/api/users"),
            request<RoleAdminData>("/api/roles"),
            request<Area[]>("/api/areas"),
          ]);
          setUsers(userList);
          setRoleAdminData(roleData);
          setAreas(areaList);
          break;
        }
        case "roles":
          setRoleAdminData(await request<RoleAdminData>("/api/roles"));
          break;
        case "notifications":
          setNotices(await request<Notice[]>("/api/notifications"));
          break;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load this page");
    } finally {
      setPageLoading(false);
    }
  }, [page, user]);

  useEffect(() => {
    request<{ user: User; csrfToken: string }>("/api/auth/session")
      .then((session) => {
        setUser(session.user);
        setCsrfToken(session.csrfToken);
      })
      .catch((reason: unknown) => {
        setUser(null);
        const message = reason instanceof Error ? reason.message : "Unable to connect to TQMS";
        if (!["Authentication required", "Invalid session", "Invalid or expired session"].includes(message)) {
          setSessionError(message);
        }
      })
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    request<CompanyProfile | null>("/api/company")
      .then(setCompany)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load business settings"));
  }, [user]);

  useEffect(() => {
    document.documentElement.dataset.theme = company?.theme ?? "forest";
  }, [company?.theme]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(page), 0);
    return () => window.clearTimeout(timer);
  }, [loadPage, page]);

  async function handleLogin(email: string, password: string) {
    const session = await request<{ user: User; csrfToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(session.user);
    setCsrfToken(session.csrfToken);
    setSessionError("");
    setPage("dashboard");
  }

  async function handleLogout() {
    try {
      await request("/api/auth/logout", { method: "POST" }, csrfToken);
    } finally {
      setUser(null);
      setCsrfToken(undefined);
    }
  }

  async function updateNotice(id: string, action: "acknowledge" | "snooze") {
    try {
      await request(`/api/notifications/${id}/${action}`, {
        method: action === "acknowledge" ? "POST" : "PATCH",
        ...(action === "snooze"
          ? { body: JSON.stringify({ snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }) }
          : {}),
      }, csrfToken);
      setNotices(await request<Notice[]>("/api/notifications"));
      setDashboard(await request<Dashboard>("/api/dashboard"));
      setError("");
      setSuccess(action === "acknowledge" ? "Notification acknowledged." : "Notification snoozed for one day.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update notification");
    }
  }

  async function uploadDocument(path: string, file: File, type?: string): Promise<boolean> {
    if (file.size > 20 * 1024 * 1024) {
      setError("Each tender or purchase order document must be 20 MB or smaller.");
      return false;
    }
    try {
      await uploadBusinessDocument(path, file, csrfToken, type);
      if (selectedTender) {
        await openTender(selectedTender.id);
        await loadPage("tenders");
      }
      setError("");
      setSuccess("Document uploaded.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to upload document");
      return false;
    }
  }

  async function downloadDocument(path: string, fileName: string) {
    try {
      await downloadBusinessDocument(path, fileName);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to download document");
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const newPassword = String(values.get("newPassword"));
    if (newPassword !== values.get("confirmPassword")) {
      setError("New password and confirmation do not match.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      const session = await request<{ user: User; csrfToken: string }>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.get("currentPassword"),
          newPassword,
        }),
      }, csrfToken);
      setUser(session.user);
      setCsrfToken(session.csrfToken);
      form.reset();
      setSuccess("Password changed. Your other active sessions have been signed out.");
      setPasswordEditorOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to change password");
    }
  }

  function exportItemsWorkbook(templateOnly = false) {
    const file = createXlsxWorkbook([{
      name: "Items",
      rows: [
        ["Item Code", "Item Name", "Category", "Brand", "Model / Specification", "Unit", "Warranty (months)", "Status"],
        ...(templateOnly ? [] : items.map((item) => [
          item.code,
          item.name,
          item.category?.name ?? "",
          item.brand?.name ?? "",
          item.modelSpecification ?? "",
          item.unit.name,
          item.warrantyMonths ?? "",
          item.active ? "Active" : "Inactive",
        ])),
      ],
    }]);
    const buffer = new ArrayBuffer(file.byteLength);
    new Uint8Array(buffer).set(file);
    const url = URL.createObjectURL(new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = templateOnly ? "tqms-items-template.xlsx" : "tqms-items.xlsx";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importItems(file: File) {
    setError("");
    setSuccess("");
    try {
      const rows = readXlsxRows(new Uint8Array(await file.arrayBuffer()));
      const headerIndex = rows.findIndex(({ cells }) => cells.some((cell) => cell?.trim()));
      if (headerIndex < 0) throw new Error("The Excel file has no item header row.");

      const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const headers = rows[headerIndex].cells.map(normalize);
      const findColumn = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const columns = {
        code: findColumn("itemcode", "code"),
        name: findColumn("itemname", "name"),
        category: findColumn("category"),
        brand: findColumn("brand"),
        model: findColumn("modelspecification", "model"),
        unit: findColumn("unit"),
        warranty: findColumn("warrantymonths", "warranty"),
        status: findColumn("status", "active"),
      };
      if (columns.code < 0 || columns.name < 0 || columns.unit < 0) {
        throw new Error("The Excel file must include Item Code, Item Name, and Unit columns.");
      }

      const valueAt = (cells: string[], column: number) => column < 0 ? "" : (cells[column] ?? "").trim();
      const activeUnits = units.filter(({ active }) => active);
      const importedCodes = new Set<string>();
      const importedItems = rows.slice(headerIndex + 1)
        .filter(({ cells }) => cells.some((cell) => cell?.trim()))
        .map(({ cells, rowNumber }) => {
          const code = valueAt(cells, columns.code);
          const name = valueAt(cells, columns.name);
          const category = valueAt(cells, columns.category);
          const brand = valueAt(cells, columns.brand);
          const unit = valueAt(cells, columns.unit);
          if (!code || !name || !unit) {
            throw new Error(`Excel row ${rowNumber} must include an item code, item name, and unit.`);
          }
          const normalizedCode = normalize(code);
          if (importedCodes.has(normalizedCode)) {
            throw new Error(`Excel row ${rowNumber} repeats item code "${code}".`);
          }
          importedCodes.add(normalizedCode);

          const selectedUnit = activeUnits.find((entry) => normalize(entry.name) === normalize(unit))
            ?? activeUnits.find((entry) => normalize(entry.abbreviation) === normalize(unit));
          if (!selectedUnit) throw new Error(`Excel row ${rowNumber} refers to unknown or inactive unit "${unit}".`);

          const rawWarranty = valueAt(cells, columns.warranty);
          const warrantyMonths = rawWarranty ? Number(rawWarranty) : null;
          if (warrantyMonths !== null && (!Number.isInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 600)) {
            throw new Error(`Excel row ${rowNumber} has an invalid warranty period.`);
          }
          const rawStatus = normalize(valueAt(cells, columns.status));
          let active = true;
          if (["inactive", "false", "no", "0"].includes(rawStatus)) active = false;
          else if (rawStatus && !["active", "true", "yes", "1"].includes(rawStatus)) {
            throw new Error(`Excel row ${rowNumber} has an invalid status; use Active or Inactive.`);
          }

          return {
            code,
            name,
            categoryName: category || null,
            brandName: brand || null,
            modelSpecification: valueAt(cells, columns.model) || null,
            unitId: selectedUnit.id,
            warrantyMonths,
            active,
          };
        });

      if (importedItems.length === 0) throw new Error("The Excel file contains no item rows to import.");
      if (importedItems.length > MAX_ITEM_IMPORT_ROWS) {
        throw new Error(`Import a maximum of ${MAX_ITEM_IMPORT_ROWS} item rows at a time.`);
      }
      if (!window.confirm(
        `Import ${importedItems.length} item(s)? Missing categories will be created, matching inactive categories and brands reactivated, and blank or unmatched brands assigned to Other. Existing item codes will not be overwritten.`,
      )) return;

      const result = await request<{
        imported: number;
        categoriesCreated: number;
        categoriesReactivated: number;
        brandsReactivated: number;
        brandsAssignedToOther: number;
      }>("/api/items/import", {
        method: "POST",
        body: JSON.stringify(importedItems),
      }, csrfToken);
      await loadPage("items");
      setCurrentPage(1);
      const details = [`Imported ${result.imported} item(s).`];
      if (result.categoriesCreated) details.push(`Created ${result.categoriesCreated} categor${result.categoriesCreated === 1 ? "y" : "ies"}.`);
      const reactivatedMasters = result.categoriesReactivated + result.brandsReactivated;
      if (reactivatedMasters) details.push(`Reactivated ${reactivatedMasters} category/brand master record(s).`);
      if (result.brandsAssignedToOther) details.push(`Assigned ${result.brandsAssignedToOther} item(s) to Other brand.`);
      setSuccess(details.join(" "));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import items from this Excel file.");
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setError("");
    setSuccess("");

    try {
      for (const fieldName of ["chequeImage", "receiptCopy"]) {
        const selectedFile = values.get(fieldName);
        if (selectedFile instanceof File && selectedFile.size > 5 * 1024 * 1024) {
          throw new Error("Each payment document must be 5 MB or smaller.");
        }
      }

      let path = "";
      let method = "POST";
      let payload: Record<string, unknown> = {};

      if (page === "items") {
        const id = editing && "code" in editing ? editing.id : undefined;
        path = id ? `/api/items/${id}` : "/api/items";
        method = id ? "PUT" : "POST";
        payload = {
          code: values.get("code"),
          name: values.get("name"),
          categoryId: values.get("categoryId") || null,
          brandId: values.get("brandId") || null,
          modelSpecification: values.get("modelSpecification") || null,
          unitId: values.get("unitId"),
          warrantyMonths: values.get("warrantyMonths") ? Number(values.get("warrantyMonths")) : null,
        };
      } else if (page === "competitors") {
        const id = editing && "name" in editing && "contactNumber" in editing ? editing.id : undefined;
        path = id ? `/api/competitors/${id}` : "/api/competitors";
        method = id ? "PUT" : "POST";
        payload = {
          name: values.get("name"),
          contactPerson: values.get("contactPerson") || null,
          contactNumber: values.get("contactNumber") || null,
          email: values.get("email") || null,
          province: values.get("province") || null,
          district: values.get("district") || null,
          address: values.get("address") || null,
        };
      } else if (page === "suppliers") {
        const id = editingSupplier?.id;
        path = id ? `/api/suppliers/${id}` : "/api/suppliers";
        method = id ? "PUT" : "POST";
        payload = {
          name: values.get("name"),
          contactPerson: values.get("contactPerson") || null,
          contactNumber: values.get("contactNumber") || null,
          email: values.get("email") || null,
          address: values.get("address") || null,
          ...(editingSupplier ? { active: values.has("active") } : {}),
        };
      } else if (page === "registrations" && payingFor) {
        path = `/api/registrations/${payingFor.id}/payments`;
        payload = {
          mode: values.get("mode"),
          amount: Number(values.get("amount")),
          paymentDate: values.get("paymentDate"),
          reference: values.get("reference") || null,
          bank: values.get("bank") || null,
          paidBy: values.get("paidBy") || null,
        };
      } else if (page === "registrations" && !renewing) {
        path = `/api/institutions/${values.get("institutionId")}/registrations`;
        payload = {
          year: Number(values.get("year")),
          registrationFee: Number(values.get("registrationFee")),
          bondAmount: Number(values.get("bondAmount")),
          registrationDate: values.get("registrationDate"),
          expiryDate: values.get("expiryDate"),
          itemIds: values.getAll("itemIds"),
        };
      } else if (page === "registrations" && renewing) {
        path = `/api/registrations/${renewing.id}/renew`;
        payload = {
          year: Number(values.get("year")),
          registrationFee: Number(values.get("registrationFee")),
          bondAmount: Number(values.get("bondAmount")),
          registrationDate: values.get("registrationDate"),
          expiryDate: values.get("expiryDate"),
        };
      } else if (page === "institutions") {
        path = "/api/institutions";
        payload = {
          name: values.get("name"),
          province: values.get("province") || null,
          district: values.get("district") || null,
          contactNumber1: values.get("contactNumber1") || null,
          address: values.get("address") || null,
        };
      } else if (page === "company") {
        path = "/api/company";
        method = "PUT";
        payload = {
          companyName: values.get("companyName"),
          address: values.get("address"),
          email: values.get("email"),
          officePhone1: values.get("officePhone1"),
          officePhone2: values.get("officePhone2") || null,
          brNumber: values.get("brNumber"),
          vatRegistrationNumber: values.get("vatRegistrationNumber"),
          quotationValidityDays: Number(values.get("quotationValidityDays")),
          vatRate: Number(values.get("vatRate")),
          minimumMarginPercent: Number(values.get("minimumMarginPercent")),
          theme: values.get("theme"),
        };
      } else if (page === "users") {
        path = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
        method = editingUser ? "PATCH" : "POST";
        const password = values.get("password");
        payload = {
          fullName: values.get("fullName"),
          email: values.get("email"),
          role: values.get("role"),
          areaAssignments: values.getAll("areaAssignments").map((value) => {
            const [province, district = ""] = String(value).split("::");
            return { province, district };
          }),
          ...(password ? { password } : {}),
        };
      } else if (page === "roles") {
        path = editingRole ? `/api/roles/${editingRole.id}` : "/api/roles";
        method = editingRole ? "PATCH" : "POST";
        payload = {
          name: values.get("name"),
          ...(editingRole ? {} : { baseRole: values.get("baseRole") }),
          permissions: values.getAll("permissions"),
        };
      }

      let documentUploadError = "";
      if (page === "registrations" && payingFor) {
        const payment = await request<{ id: string }>(path, { method, body: JSON.stringify(payload) }, csrfToken);
        const optionalDocuments: { field: string; type: PaymentDocumentType; label: string }[] = [
          { field: "chequeImage", type: "CHEQUE_IMAGE", label: "Cheque photo" },
          { field: "receiptCopy", type: "RECEIPT_COPY", label: "Receipt copy" },
        ];
        for (const document of optionalDocuments) {
          const file = values.get(document.field);
          if (!(file instanceof File) || file.size === 0) continue;
          try {
            await uploadPaymentDocument(payment.id, document.type, file, csrfToken);
          } catch (reason) {
            documentUploadError = `${document.label} upload failed: ${reason instanceof Error ? reason.message : "Unable to upload document"}`;
            break;
          }
        }
      } else {
        await request(path, { method, body: JSON.stringify(payload) }, csrfToken);
      }
      setEditing(null);
      setEditingSupplier(null);
      setRenewing(null);
      setPayingFor(null);
      setEditingUser(null);
      setUserEditorOpen(false);
      setEditingRole(null);
      setRoleEditorOpen(false);
      setCompanyEditorOpen(false);
      setInstitutionEditorOpen(false);
      setPasswordEditorOpen(false);
      setEditorOpen(false);
      setSupplierEditorOpen(false);
      setNewRegistrationOpen(false);
      setSuccess(
        documentUploadError
          ? `Payment recorded, but ${documentUploadError}`
          : page === "suppliers"
          ? editingSupplier
            ? "Supplier details updated."
            : "Supplier added."
          : page === "institutions"
          ? "Institution added."
          : page === "users"
            ? editingUser ? "User details and role updated." : "User created."
          : page === "roles"
            ? editingRole ? "Custom role updated." : "Custom role created."
          : page === "registrations"
            ? renewing
              ? "Renewal recorded. The previous registration remains in history."
              : payingFor
                ? "Payment recorded."
                : "Supplier registration recorded."
            : "Changes saved successfully.",
      );
      setError("");
      form.reset();
      await loadPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save changes");
    }
  }

  async function updatePaymentDocument(paymentId: string, type: PaymentDocumentType, file: File) {
    setError("");
    setSuccess("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Each payment document must be 5 MB or smaller.");
      const document = await uploadPaymentDocument(paymentId, type, file, csrfToken);
      setPayingFor((current) => current ? {
        ...current,
        payments: current.payments.map((payment) => payment.id === paymentId
          ? { ...payment, documents: [...payment.documents.filter((entry) => entry.type !== type), document] }
          : payment),
      } : current);
      setSuccess("Payment document updated.");
      await loadPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update payment document");
    }
  }

  async function removePaymentDocument(paymentId: string, type: PaymentDocumentType) {
    setError("");
    setSuccess("");
    try {
      await request(`/api/registration-payments/${paymentId}/documents/${type}`, { method: "DELETE" }, csrfToken);
      setPayingFor((current) => current ? {
        ...current,
        payments: current.payments.map((payment) => payment.id === paymentId
          ? { ...payment, documents: payment.documents.filter((entry) => entry.type !== type) }
          : payment),
      } : current);
      setSuccess("Payment document removed.");
      await loadPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove payment document");
    }
  }

  async function deactivate(item: Item | Competitor) {
    const endpoint = "code" in item ? "items" : "competitors";
    if (!window.confirm(`Deactivate ${item.name}?`)) return;
    try {
      await request(`/api/${endpoint}/${item.id}`, { method: "DELETE" }, csrfToken);
      setSuccess(`${item.name} deactivated.`);
      await loadPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to deactivate record");
    }
  }

  async function toggleUser(target: User) {
    try {
      await request(`/api/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !target.active }),
      }, csrfToken);
      await loadPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update user");
    }
  }

  function editUser(target: User) {
    setEditingUser(target);
    setUserEditorOpen(true);
    setError("");
    setSuccess("");
  }

  function editRole(target: CustomRole) {
    setEditingRole(target);
    setRoleEditorOpen(true);
    setError("");
    setSuccess("");
  }

  async function deleteRole(target: CustomRole) {
    if (!window.confirm(`Delete the custom role "${target.name}"?`)) return;
    try {
      await request(`/api/roles/${target.id}`, { method: "DELETE" }, csrfToken);
      setSuccess(`Custom role "${target.name}" deleted.`);
      await loadPage("roles");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete custom role");
    }
  }

  async function toggleSupplier(target: Supplier) {
    try {
      if (target.active) {
        await request(`/api/suppliers/${target.id}`, { method: "DELETE" }, csrfToken);
      } else {
        await request(`/api/suppliers/${target.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...target, active: true }),
        }, csrfToken);
      }
      setSuccess(`Supplier ${target.name} ${target.active ? "deactivated" : "reactivated"}.`);
      await loadPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update supplier");
    }
  }

  async function saveMaster(event: FormEvent<HTMLFormElement>, kind: MasterKind): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = kind === "units"
      ? { name: values.get("name"), abbreviation: values.get("abbreviation") }
      : { name: values.get("name") };
    setError("");
    setSuccess("");
    try {
      await request(`/api/${kind === "categories" ? "item-categories" : kind}`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, csrfToken);
      form.reset();
      setSuccess(`${kind === "categories" ? "Category" : kind === "brands" ? "Brand" : "Unit"} added.`);
      await loadPage();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save item master value");
      return false;
    }
  }

  async function updateMaster(event: FormEvent<HTMLFormElement>, kind: MasterKind, value: ItemCategory | Brand | Unit): Promise<boolean> {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const payload = kind === "units"
      ? { name: values.get("name"), abbreviation: values.get("abbreviation"), active: value.active }
      : { name: values.get("name"), active: value.active };
    const endpoint = kind === "categories" ? "item-categories" : kind;
    setError("");
    setSuccess("");
    try {
      await request(`/api/${endpoint}/${value.id}`, { method: "PUT", body: JSON.stringify(payload) }, csrfToken);
      setSuccess(`${kind === "categories" ? "Category" : kind === "brands" ? "Brand" : "Unit"} updated.`);
      await loadPage();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update item master value");
      return false;
    }
  }

  async function toggleMaster(kind: MasterKind, value: ItemCategory | Brand | Unit) {
    const endpoint = kind === "categories" ? "item-categories" : kind;
    try {
      if (value.active) {
        await request(`/api/${endpoint}/${value.id}`, { method: "DELETE" }, csrfToken);
      } else {
        const payload = "abbreviation" in value
          ? { name: value.name, abbreviation: value.abbreviation, active: true }
          : { name: value.name, active: true };
        await request(`/api/${endpoint}/${value.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        }, csrfToken);
      }
      await loadPage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update item master value");
    }
  }

  async function openTender(id: string) {
    try {
      const tender = await request<TenderRecord>(`/api/tenders/${id}`);
      setSelectedTender(tender);
      setTenderResults(null);
      setError("");
      if (!(user?.permissions?.includes("readings.view") ?? true)) {
        setTenderResultsLoading(false);
        return;
      }

      setTenderResultsLoading(true);
      try {
        setTenderResults(await request<TenderResults>(`/api/tenders/${id}/results`));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to load tender results");
      } finally {
        setTenderResultsLoading(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load tender details");
    }
  }

  async function createTender(payload: Record<string, unknown>) {
    try {
      const created = await request<TenderRecord>("/api/tenders", {
        method: "POST",
        body: JSON.stringify(payload),
      }, csrfToken);
      setSelectedTender(created);
      setTenderCreateOpen(false);
      setSuccess(created.registrationWarning
        ? "Tender created. Warning: supplier registration is not valid through the closing date."
        : "Tender created.");
      await loadPage("tenders");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create tender");
    }
  }

  async function addSupplierPrice(tenderItemId: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      await request(`/api/tender-items/${tenderItemId}/prices`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, csrfToken);
      if (selectedTender) await openTender(selectedTender.id);
      await loadPage("tenders");
      setSuccess("Supplier price recorded.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save supplier price");
      return false;
    }
  }

  async function updateSupplierPrice(priceId: string, payload: Record<string, unknown>) {
    try {
      await request(`/api/supplier-prices/${priceId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }, csrfToken);
      if (selectedTender) await openTender(selectedTender.id);
      await loadPage("tenders");
      setEditingSupplierPrice(null);
      setSuccess("Supplier price updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update supplier price");
    }
  }

  async function predictTenderItemPrice(tenderId: string, itemId: string, payload: Record<string, unknown>) {
    return request<PricePrediction>(`/api/tenders/${tenderId}/items/${itemId}/price-prediction`, {
      method: "POST",
      body: JSON.stringify(payload),
    }, csrfToken);
  }

  async function createQuotation(tenderId: string, payload: Record<string, unknown>) {
    try {
      const quotation = await request<Quotation & { minimumMarginWarnings: { item: string; marginPercent: number }[] }>(`/api/tenders/${tenderId}/quotations`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, csrfToken);
      await openTender(tenderId);
      await loadPage("tenders");
      setSuccess(quotation.minimumMarginWarnings.length
        ? `Quotation V${quotation.version} saved. Warning: one or more lines are below the configured minimum margin.`
        : `Quotation V${quotation.version} saved as a draft.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create quotation");
    }
  }

  async function quotationAction(quotationId: string, action: "submit" | "approve" | "reject") {
    const body = action === "reject" ? { reason: window.prompt("Enter a reason for rejection")?.trim() } : undefined;
    if (action === "reject" && !body?.reason) return;
    try {
      await request(`/api/quotations/${quotationId}/${action}`, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      }, csrfToken);
      if (selectedTender) await openTender(selectedTender.id);
      await loadPage("tenders");
      setSuccess(action === "submit" ? "Quotation submitted for approval." : action === "approve" ? "Quotation approval recorded." : "Quotation rejected.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update quotation");
    }
  }

  async function submitTender(tenderId: string) {
    try {
      await request(`/api/tenders/${tenderId}/submit`, { method: "POST" }, csrfToken);
      await openTender(tenderId);
      await loadPage("tenders");
      setSuccess("Tender marked as submitted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit tender");
    }
  }

  async function saveTenderResult(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", payload?: Record<string, unknown>, successMessage?: string): Promise<boolean> {
    if (!selectedTender) return false;
    try {
      await request(path, {
        method,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      }, csrfToken);
      await openTender(selectedTender.id);
      await loadPage("tenders");
      if (successMessage) setSuccess(successMessage);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save tender result");
      return false;
    }
  }

  async function completeTender() {
    if (!selectedTender) return;
    try {
      await request(`/api/tenders/${selectedTender.id}/complete`, { method: "POST" }, csrfToken);
      await openTender(selectedTender.id);
      await loadPage("tenders");
      setSuccess("Tender marked as completed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete tender");
    }
  }

  if (sessionLoading) return <div className="boot-screen"><div className="brand-mark">T</div><span>Starting TQMS…</span></div>;
  if (!user) return <Login onLogin={handleLogin} initialError={sessionError} />;

  const can = (permission: string) => user.permissions?.includes(permission) ?? false;
  const navigation: { id: Page; label: string; icon: typeof LayoutDashboard; roles?: Role[]; permission?: string }[] = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard, permission: "dashboard.view" },
    { id: "reports", label: "Reports & analytics", icon: BarChart3, permission: "reports.view" },
    { id: "tenders", label: "Tenders", icon: ClipboardList, permission: "tenders.view" },
    { id: "items", label: "Item master", icon: Package, permission: "items.view" },
    { id: "competitors", label: "Competitors", icon: Users, permission: "competitors.view" },
    { id: "institutions", label: "Institutions", icon: Building2, permission: "institutions.view" },
    { id: "registrations", label: "Supplier registrations", icon: ClipboardList, permission: "registrations.view" },
    { id: "categories", label: "Categories", icon: Package, permission: "items.view" },
    { id: "brands", label: "Brands", icon: Package, permission: "items.view" },
    { id: "units", label: "Units", icon: Package, permission: "items.view" },
    { id: "suppliers", label: "Suppliers", icon: Building2, permission: "suppliers.view" },
    { id: "company", label: "Business settings", icon: Building2, permission: "company.view" },
    { id: "users", label: "Sales reps & users", icon: ShieldCheck, roles: ["ADMIN"] },
    { id: "roles", label: "Roles & permissions", icon: ShieldCheck, roles: ["ADMIN"] },
    { id: "notifications", label: "Notifications", icon: Bell, permission: "notifications.view" },
    { id: "security", label: "Security", icon: KeyRound },
  ];
  const visibleNavigation = navigation.filter((entry) =>
    (!entry.roles || entry.roles.includes(user.role)) &&
    (!entry.permission || can(entry.permission)));
  const pageTitle = navigation.find((entry) => entry.id === page)?.label ?? "Overview";

  const filteredItems = items.filter((item) => `${item.code} ${item.name} ${item.category?.name ?? ""} ${item.brand?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const filteredCompetitors = competitors.filter((competitor) => `${competitor.name} ${competitor.district ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const filteredSuppliers = suppliers.filter((supplier) => `${supplier.name} ${supplier.contactPerson ?? ""} ${supplier.contactNumber ?? ""} ${supplier.email ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const filteredTenders = tenders.filter((tender) => `${formatTenderNumber(tender.tenderNumber)} ${tender.referenceNumber} ${tender.institution.name} ${tender.type} ${tender.status} ${tender.responsibleRep.fullName} ${tender.district ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const filteredInstitutions = institutions.filter((institution) => `${institution.name} ${institution.province ?? ""} ${institution.district ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRegistrations = registrations.filter((record) => `${record.institution.name} ${record.year} ${record.status}`.toLowerCase().includes(query.toLowerCase()));
  const filteredCategories = categories.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
  const filteredBrands = brands.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
  const filteredUnits = units.filter((entry) => `${entry.name} ${entry.abbreviation}`.toLowerCase().includes(query.toLowerCase()));
  const filteredUsers = users.filter((row) => `${row.fullName} ${row.email} ${row.customRoleName ?? roleLabels[row.role]}`.toLowerCase().includes(query.toLowerCase()));
  const filteredNotices = notices.filter((notice) => `${notice.title} ${notice.message}`.toLowerCase().includes(query.toLowerCase()));
  const itemPage = paginate(filteredItems, currentPage, pageSize);
  const competitorPage = paginate(filteredCompetitors, currentPage, pageSize);
  const supplierPage = paginate(filteredSuppliers, currentPage, pageSize);
  const tenderPage = paginate(filteredTenders, currentPage, pageSize);
  const institutionPage = paginate(filteredInstitutions, currentPage, pageSize);
  const registrationPage = paginate(filteredRegistrations, currentPage, pageSize);
  const categoryPage = paginate(filteredCategories, currentPage, pageSize);
  const brandPage = paginate(filteredBrands, currentPage, pageSize);
  const unitPage = paginate(filteredUnits, currentPage, pageSize);
  const userPage = paginate(filteredUsers, currentPage, pageSize);
  const noticePage = paginate(filteredNotices, currentPage, pageSize);
  const updateQuery = (value: string) => { setQuery(value); setCurrentPage(1); };
  const navigate = (target: Page) => { setPage(target); setCurrentPage(1); setQuery(""); };

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">T</div>
          <div><strong>TQMS</strong><span>QUOTATION MANAGEMENT</span></div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {visibleNavigation.filter(({ id }) => !["categories", "brands", "units", "suppliers", "company", "users", "roles"].includes(id)).map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${page === id ? "active" : ""}`} onClick={() => { navigate(id); setSidebarOpen(false); setEditing(null); setRenewing(null); setPayingFor(null); setEditorOpen(false); setNewRegistrationOpen(false); }}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {id === "notifications" && (dashboard?.notifications.length ?? 0) > 0 && <span className="nav-count">{dashboard?.notifications.length}</span>}
            </button>
          ))}
          {visibleNavigation.some(({ id }) => ["categories", "brands", "units", "suppliers", "company", "users", "roles"].includes(id)) && <>
            <button type="button" className={`nav-link administration-toggle ${["categories", "brands", "units", "suppliers", "company", "users", "roles"].includes(page) ? "active" : ""}`} aria-expanded={administrationOpen} onClick={() => setAdministrationOpen((open) => !open)}>
              <Settings size={18} strokeWidth={1.8} /><span>Administration</span><ChevronDown size={15} className={administrationOpen ? "submenu-chevron open" : "submenu-chevron"} />
            </button>
            {administrationOpen && <div className="nav-submenu">
              {visibleNavigation.filter(({ id }) => ["categories", "brands", "units", "suppliers", "company", "users", "roles"].includes(id)).map(({ id, label }) => (
                <button key={id} type="button" className={`nav-link submenu-link ${page === id ? "active" : ""}`} onClick={() => { navigate(id); setSidebarOpen(false); setEditing(null); setEditorOpen(false); }}>
                  <span>{label}</span>
                </button>
              ))}
            </div>}
          </>}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-card"><div className="system-icon"><Activity size={17} /></div><div><strong>System ready</strong><span>Phase 1 workspace</span></div><i /></div>
          <button className="nav-link" onClick={() => navigate("company")}><CircleHelp size={18} /><span>Help & support</span></button>
          <div className="sidebar-version">TQMS · INITIAL RELEASE</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-separator">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <button className="icon-button top-notice" aria-label="View notifications" onClick={() => navigate("notifications")}><Bell size={18} />{dashboard?.notifications.length ? <i /> : null}</button>
            <div className="user-menu"><div className="avatar">{initials(user.fullName)}</div><div className="user-meta"><strong>{user.fullName}</strong><span>{user.customRoleName ?? roleLabels[user.role]}</span></div><ChevronDown size={16} className="user-caret" /></div>
            <button className="icon-button logout-button" title="Sign out" aria-label="Sign out" onClick={() => void handleLogout()}><LogOut size={18} /></button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">TENDER QUOTATION MANAGEMENT SYSTEM</p>
              <h1>{page === "dashboard" ? `Good ${timeOfDay(today)}, ${user.fullName.split(" ")[0]}` : pageTitle}</h1>
              <p className="page-subtitle">{pageSubtitle(page)}</p>
            </div>
            <div className="heading-date"><span>{new Intl.DateTimeFormat("en-LK", { weekday: "long" }).format(today)}</span><strong>{formatDate(today.toISOString())}</strong></div>
          </div>
          {error && <div className="feedback error-feedback" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
          {success && <div className="feedback success-feedback" role="status">{success}<button onClick={() => setSuccess("")} aria-label="Dismiss message"><X size={15} /></button></div>}
          {pageLoading && <div className="loading-line"><span />Loading workspace data…</div>}
          {page === "dashboard" && <DashboardPage data={dashboard} onNavigate={navigate} />}
          {page === "reports" && <ReportsPage report={tenderReport} accuracy={predictionAccuracy} loading={pageLoading} onApplyFilters={async (filters) => {
            const search = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
            const queryString = search.toString();
            try {
              setTenderReport(await request<TenderReport>(`/api/reports/tenders${queryString ? `?${queryString}` : ""}`));
              setError("");
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Unable to load tender reports");
            }
          }} />}
          {page === "tenders" && (
            <ListPage
              title="Tender register"
              description="Capture tenders, supplier prices, bid bonds, and approved customer quotations."
              count={tenders.length}
              query={query}
              onQuery={updateQuery}
              action={can("tenders.create") && <button className="primary-button" onClick={() => setTenderCreateOpen((open) => !open)}>＋ New tender</button>}
            >
              {tenderCreateOpen && <Modal title="Create tender" className="entry-modal" onClose={() => setTenderCreateOpen(false)}><TenderCreateForm institutions={tenderInstitutions} reps={tenderReps} areas={areas} banks={banks} currentUser={user} onSubmit={(payload) => void createTender(payload)} onCancel={() => setTenderCreateOpen(false)} /></Modal>}
              <div className="table-card"><TendersTable rows={tenderPage.rows} selectedId={selectedTender?.id} onSelect={(id) => void openTender(id)} /></div>
              <Pagination page={tenderPage.page} totalPages={tenderPage.totalPages} total={filteredTenders.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
              {selectedTender && <Modal
                title={`Tender ${formatTenderNumber(selectedTender.tenderNumber)} · ${selectedTender.referenceNumber}`}
                className="tender-details-modal"
                onClose={() => { setSelectedTender(null); setTenderResults(null); }}
              >
                <TenderDetailsPanel
                  key={selectedTender.id}
                  tender={selectedTender}
                  results={tenderResults}
                  resultsLoading={tenderResultsLoading}
                  suppliers={tenderSuppliers}
                  banks={banks}
                  currentUser={user}
                  onClose={() => { setSelectedTender(null); setTenderResults(null); }}
                  onAddPrice={addSupplierPrice}
                  onCreateQuotation={(payload) => void createQuotation(selectedTender.id, payload)}
                  onQuotationAction={(quotationId, action) => void quotationAction(quotationId, action)}
                  onSubmitTender={() => void submitTender(selectedTender.id)}
                  onResultAction={(path, method, payload, message) => saveTenderResult(path, method, payload, message)}
                  onCompleteTender={() => void completeTender()}
                  onEditSupplierPrice={setEditingSupplierPrice}
                  onPredictPrice={predictTenderItemPrice}
                  onUploadDocument={uploadDocument}
                  onDownloadDocument={downloadDocument}
                />
              </Modal>}
            </ListPage>
          )}
          {page === "suppliers" && (
            <ListPage
              title="Suppliers"
              description="Maintain supplier contacts available for tender pricing."
              count={suppliers.length}
              query={query}
              onQuery={updateQuery}
              action={can("suppliers.create") && <button className="primary-button" onClick={() => { setEditingSupplier(null); setSupplierEditorOpen(true); }}>＋ Add supplier</button>}
            >
              {(editingSupplier || supplierEditorOpen) && <Modal title={editingSupplier ? "Edit supplier" : "Add a supplier"} onClose={() => { setEditingSupplier(null); setSupplierEditorOpen(false); }}>
                <form className="editor-card modal-form" onSubmit={(event) => void submitForm(event)}>
                  <div className="editor-heading"><div><h2>{editingSupplier ? "Edit supplier" : "Add a supplier"}</h2><p>Supplier names must be unique.</p></div><button type="button" className="icon-button" onClick={() => { setEditingSupplier(null); setSupplierEditorOpen(false); }} aria-label="Close form"><X size={18} /></button></div>
                  <div className="form-grid">
                    <Field label="Supplier name" name="name" required defaultValue={editingSupplier?.name ?? ""} />
                    <Field label="Contact person" name="contactPerson" defaultValue={editingSupplier?.contactPerson ?? ""} />
                    <Field label="Contact number" name="contactNumber" defaultValue={editingSupplier?.contactNumber ?? ""} />
                    <Field label="Email" name="email" type="email" defaultValue={editingSupplier?.email ?? ""} />
                    <label className="field field-wide"><span>Address</span><textarea name="address" rows={2} defaultValue={editingSupplier?.address ?? ""} /></label>
                    {editingSupplier && <label className="field"><span><input name="active" type="checkbox" defaultChecked={editingSupplier.active} /> Active supplier</span></label>}
                  </div>
                  <FormActions onCancel={() => { setEditingSupplier(null); setSupplierEditorOpen(false); }} label={editingSupplier ? "Save supplier" : "Add supplier"} />
                </form>
              </Modal>}
              <div className="table-card"><SuppliersTable rows={supplierPage.rows} canManage={can("suppliers.manage")} onEdit={(row) => { setEditingSupplier(row); setSupplierEditorOpen(true); }} onToggle={(row) => void toggleSupplier(row)} /></div>
              <Pagination page={supplierPage.page} totalPages={supplierPage.totalPages} total={filteredSuppliers.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
            </ListPage>
          )}
          {page === "items" && (
            <ListPage
              title="Tender item catalogue"
              description="Manage the products and equipment quoted to customers."
              count={items.length}
              query={query}
              onQuery={updateQuery}
              action={<div className="item-actions">
                {can("items.manage") && <label className="secondary-button item-import-button">Import Excel<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void importItems(file);
                }} /></label>}
                {can("items.manage") && <button className="secondary-button" onClick={() => exportItemsWorkbook(true)}>Template</button>}
                {can("items.view") && <button className="secondary-button" onClick={() => exportItemsWorkbook()}>Export Excel</button>}
                {can("items.create") && <button className="primary-button" onClick={() => { setEditing(null); setEditorOpen(true); }}>＋ Add item</button>}
              </div>}
            >
              {(editing && "code" in editing || editorOpen) && <Modal title={editing && "code" in editing ? "Edit item" : "Add an item"} onClose={() => { setEditing(null); setEditorOpen(false); }}>
              <form className="editor-card modal-form" onSubmit={(event) => void submitForm(event)}>
                <div className="editor-heading"><div><h2>{editing && "code" in editing ? "Edit item" : "Add an item"}</h2><p>Item code and name are required.</p></div><button type="button" className="icon-button" onClick={() => { setEditing(null); setEditorOpen(false); }} aria-label="Close form"><X size={18} /></button></div>
                <div className="form-grid">
                  <Field label="Item code" name="code" required defaultValue={editing && "code" in editing ? editing.code : ""} />
                  <Field label="Item name" name="name" required defaultValue={editing && "code" in editing ? editing.name : ""} />
                  <label className="field"><span>Category</span><select name="categoryId" defaultValue={editing && "code" in editing ? editing.categoryId ?? "" : ""}><option value="">No category</option>{categories.filter((entry) => entry.active || entry.id === (editing && "code" in editing ? editing.categoryId : null)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.active ? "" : " (inactive)"}</option>)}</select></label>
                  <label className="field"><span>Brand</span><select name="brandId" defaultValue={editing && "code" in editing ? editing.brandId ?? "" : ""}><option value="">No brand</option>{brands.filter((entry) => entry.active || entry.id === (editing && "code" in editing ? editing.brandId : null)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.active ? "" : " (inactive)"}</option>)}</select></label>
                  <Field label="Model / specification" name="modelSpecification" defaultValue={editing && "code" in editing ? editing.modelSpecification ?? "" : ""} />
                  <label className="field"><span>Unit <i>*</i></span><select name="unitId" required defaultValue={editing && "code" in editing ? editing.unitId : units.find((entry) => entry.active)?.id ?? ""}>{units.filter((entry) => entry.active || entry.id === (editing && "code" in editing ? editing.unitId : null)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.abbreviation}){entry.active ? "" : " (inactive)"}</option>)}</select></label>
                  <Field label="Warranty (months)" name="warrantyMonths" type="number" defaultValue={editing && "code" in editing ? editing.warrantyMonths ?? "" : ""} />
                </div>
                <FormActions onCancel={() => { setEditing(null); setEditorOpen(false); }} />
              </form>
              </Modal>}
              <div className="table-card"><ItemsTable rows={itemPage.rows} canManage={can("items.manage")} onEdit={setEditing} onDeactivate={(row) => void deactivate(row)} /></div>
              <Pagination page={itemPage.page} totalPages={itemPage.totalPages} total={filteredItems.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
            </ListPage>
          )}
          {page === "categories" && (
            <ListPage title="Item categories" description="Create and maintain categories used to organize the item catalogue." count={categories.length} query={query} onQuery={updateQuery}>
              <section className="item-master-panel master-management-page">
                <MasterOptions title="Categories" kind="categories" values={categoryPage.rows} canCreate={can("items.create")} canManage={can("items.manage")} onAdd={saveMaster} onUpdate={updateMaster} onToggle={(kind, value) => void toggleMaster(kind, value)} />
                <Pagination page={categoryPage.page} totalPages={categoryPage.totalPages} total={filteredCategories.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
              </section>
            </ListPage>
          )}
          {page === "brands" && (
            <ListPage title="Brands" description="Create and maintain brands available in the item catalogue." count={brands.length} query={query} onQuery={updateQuery}>
              <section className="item-master-panel master-management-page">
                <MasterOptions title="Brands" kind="brands" values={brandPage.rows} canCreate={can("items.create")} canManage={can("items.manage")} onAdd={saveMaster} onUpdate={updateMaster} onToggle={(kind, value) => void toggleMaster(kind, value)} />
                <Pagination page={brandPage.page} totalPages={brandPage.totalPages} total={filteredBrands.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
              </section>
            </ListPage>
          )}
          {page === "units" && (
            <ListPage title="Units" description="Manage the units available when adding or updating item records." count={units.length} query={query} onQuery={updateQuery}>
              <section className="item-master-panel master-management-page">
                <MasterOptions title="Units" kind="units" values={unitPage.rows} canCreate={can("items.create")} canManage={can("items.manage")} onAdd={saveMaster} onUpdate={updateMaster} onToggle={(kind, value) => void toggleMaster(kind, value)} />
                <Pagination page={unitPage.page} totalPages={unitPage.totalPages} total={filteredUnits.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
              </section>
            </ListPage>
          )}
          {page === "competitors" && (
            <ListPage title="Competitor directory" description="Keep competitor contact details ready for tender tracking." count={competitors.length} query={query} onQuery={updateQuery} action={can("competitors.create") && <button className="primary-button" onClick={() => { setEditing(null); setEditorOpen(true); }}>＋ Add competitor</button>}>
              {(editing && "contactNumber" in editing || editorOpen) && <Modal title={editing && "contactNumber" in editing ? "Edit competitor" : "Add a competitor"} onClose={() => { setEditing(null); setEditorOpen(false); }}>
              <form className="editor-card modal-form" onSubmit={(event) => void submitForm(event)}>
                <div className="editor-heading"><div><h2>{editing && "contactNumber" in editing ? "Edit competitor" : "Add a competitor"}</h2><p>Names must be unique.</p></div><button type="button" className="icon-button" onClick={() => { setEditing(null); setEditorOpen(false); }} aria-label="Close form"><X size={18} /></button></div>
                <div className="form-grid">
                  <Field label="Company name" name="name" required defaultValue={editing && "contactNumber" in editing ? editing.name : ""} />
                  <Field label="Contact person" name="contactPerson" defaultValue={editing && "contactNumber" in editing ? editing.contactPerson ?? "" : ""} />
                  <Field label="Contact number" name="contactNumber" defaultValue={editing && "contactNumber" in editing ? editing.contactNumber ?? "" : ""} />
                  <Field label="Email" name="email" type="email" defaultValue={editing && "contactNumber" in editing ? editing.email ?? "" : ""} />
                  <AreaFields key={editing && "contactNumber" in editing ? editing.id : "new"} areas={areas} provinceDefault={editing && "contactNumber" in editing ? editing.province ?? "" : ""} districtDefault={editing && "contactNumber" in editing ? editing.district ?? "" : ""} />
                  <Field label="Address" name="address" defaultValue={editing && "contactNumber" in editing ? editing.address ?? "" : ""} />
                </div>
                <FormActions onCancel={() => { setEditing(null); setEditorOpen(false); }} />
              </form>
              </Modal>}
              <div className="table-card"><CompetitorTable rows={competitorPage.rows} canManage={can("competitors.manage")} onEdit={setEditing} onDeactivate={(row) => void deactivate(row)} /></div>
              <Pagination page={competitorPage.page} totalPages={competitorPage.totalPages} total={filteredCompetitors.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
            </ListPage>
          )}
          {page === "institutions" && (
            <ListPage title="Institutions" description="Maintain the organizations your suppliers register with." count={institutions.length} query={query} onQuery={updateQuery} action={can("institutions.create") && <button className="primary-button" onClick={() => setInstitutionEditorOpen(true)}>＋ Add institution</button>}>
              <div className="table-card"><InstitutionTable rows={institutionPage.rows} /></div>
              <Pagination page={institutionPage.page} totalPages={institutionPage.totalPages} total={filteredInstitutions.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
            </ListPage>
          )}
          {page === "registrations" && (
            <ListPage title="Supplier registrations" description="Track institutional registrations, yearly renewals and expiry dates." count={registrations.length} query={query} onQuery={updateQuery} action={can("registrations.create") && <button className="primary-button" onClick={() => { setRenewing(null); setNewRegistrationOpen((open) => !open); }}>＋ New registration</button>}>
              {payingFor && <Modal title={`Record payment · ${payingFor.institution.name}`} onClose={() => setPayingFor(null)}><form className="editor-card modal-form" onSubmit={(event) => void submitForm(event)}>
                <div className="editor-heading"><div><h2>Record payment · {payingFor.institution.name}</h2><p>Keep fee and bond receipts linked to this registration year.</p></div><button type="button" className="icon-button" onClick={() => setPayingFor(null)} aria-label="Close form"><X size={18} /></button></div>
                <div className="form-grid">
                  <label className="field"><span>Payment type <i>*</i></span><select name="mode" required defaultValue="BANK_TRANSFER"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></label>
                  <Field label="Amount (LKR)" name="amount" type="number" required defaultValue={0} />
                  <Field label="Payment date" name="paymentDate" type="date" required defaultValue={todayInput} />
                  <Field label="Receipt / reference no." name="reference" />
                  <label className="field"><span>Bank</span><select name="bank" defaultValue=""><option value="">Select bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name} · {bank.code}</option>)}</select></label>
                  <Field label="Paid by" name="paidBy" />
                </div>
                <div className="form-grid payment-document-inputs">
                  <label className="field"><span>Cheque photo (optional)</span><input name="chequeImage" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" /></label>
                  <label className="field"><span>Receipt copy (optional)</span><input name="receiptCopy" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" /></label>
                  <span className="field-hint field-wide">PDF, JPEG, PNG, or WebP; maximum 5 MB per file. Documents can be added or replaced later.</span>
                </div>
                {payingFor.payments.length > 0 && <section className="payment-history">
                  <h3>Recorded payments and verification documents</h3>
                  {payingFor.payments.map((payment) => <div className="payment-history-entry" key={payment.id}>
                    <div className="payment-history-heading">
                      <strong>{currency(payment.amount)} · {payment.mode.replaceAll("_", " ")}</strong>
                      <span>{formatDate(payment.paymentDate)}{payment.reference ? ` · Ref ${payment.reference}` : ""}</span>
                    </div>
                    <div className="payment-document-controls">
                      <PaymentDocumentControl paymentId={payment.id} type="CHEQUE_IMAGE" document={payment.documents.find((document) => document.type === "CHEQUE_IMAGE")} onUpload={(file) => void updatePaymentDocument(payment.id, "CHEQUE_IMAGE", file)} onRemove={() => void removePaymentDocument(payment.id, "CHEQUE_IMAGE")} />
                      <PaymentDocumentControl paymentId={payment.id} type="RECEIPT_COPY" document={payment.documents.find((document) => document.type === "RECEIPT_COPY")} onUpload={(file) => void updatePaymentDocument(payment.id, "RECEIPT_COPY", file)} onRemove={() => void removePaymentDocument(payment.id, "RECEIPT_COPY")} />
                    </div>
                  </div>)}
                </section>}
                <FormActions onCancel={() => setPayingFor(null)} label="Record payment" />
              </form></Modal>}
              {renewing && <Modal title={`Renew ${renewing.institution.name}`} onClose={() => setRenewing(null)}><form className="editor-card modal-form" onSubmit={(event) => void submitForm(event)}>
                <div className="editor-heading"><div><h2>Renew {renewing.institution.name}</h2><p>Creates a new year entry; the existing registration history is retained.</p></div><button type="button" className="icon-button" onClick={() => setRenewing(null)} aria-label="Close renewal form"><X size={18} /></button></div>
                <div className="form-grid">
                  <Field label="Registration year" name="year" type="number" required defaultValue={renewing.year + 1} />
                  <Field label="Registration fee (LKR)" name="registrationFee" type="number" required defaultValue={renewing.registrationFee} />
                  <Field label="Bond amount (LKR)" name="bondAmount" type="number" required defaultValue={renewing.bondAmount} />
                  <Field label="Registration date" name="registrationDate" type="date" required defaultValue={todayInput} />
                  <Field label="Expiry date" name="expiryDate" type="date" required defaultValue={expiryInput} />
                </div>
                <FormActions onCancel={() => setRenewing(null)} label="Record renewal" />
              </form></Modal>}
              {newRegistrationOpen && <Modal title="Record a supplier registration" className="entry-modal" onClose={() => setNewRegistrationOpen(false)}><form className="editor-card modal-form" onSubmit={(event) => void submitForm(event)}>
                <div className="editor-heading"><div><h2>Record a supplier registration</h2><p>Select an institution and the items covered by this registration.</p></div><button type="button" className="icon-button" onClick={() => setNewRegistrationOpen(false)} aria-label="Close form"><X size={18} /></button></div>
                <div className="form-grid">
                  <label className="field"><span>Institution <i>*</i></span><select name="institutionId" required defaultValue=""><option value="" disabled>Select institution</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
                  <Field label="Registration year" name="year" type="number" required defaultValue={today.getFullYear()} />
                  <Field label="Registration fee (LKR)" name="registrationFee" type="number" required defaultValue={0} />
                  <Field label="Bond amount (LKR)" name="bondAmount" type="number" required defaultValue={0} />
                  <Field label="Registration date" name="registrationDate" type="date" required defaultValue={todayInput} />
                  <Field label="Expiry date" name="expiryDate" type="date" required defaultValue={expiryInput} />
                  <div className="field field-wide"><span>Registered items</span><RegistrationItemPicker /></div>
                </div>
                <FormActions onCancel={() => setNewRegistrationOpen(false)} label="Save registration" />
              </form></Modal>}
              <div className="registration-summary">
                <div><span>Current registrations</span><strong>{registrations.filter((row) => row.status !== "EXPIRED").length}</strong></div>
                <div><span>Expiring in 60 days</span><strong className="text-amber">{registrations.filter((row) => row.daysUntilExpiry >= 0 && row.daysUntilExpiry <= 60).length}</strong></div>
                <div><span>Expired</span><strong className="text-red">{registrations.filter((row) => row.status === "EXPIRED").length}</strong></div>
                <div><span>Institutions</span><strong>{institutions.length}</strong></div>
              </div>
              <div className="table-card"><RegistrationTable rows={registrationPage.rows} canRenew={can("registrations.manage")} canRecordPayment={can("registrationPayments.manage")} onRenew={setRenewing} onPayment={setPayingFor} /></div>
              <Pagination page={registrationPage.page} totalPages={registrationPage.totalPages} total={filteredRegistrations.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
            </ListPage>
          )}
          {page === "company" && (
            <div className="settings-layout">
              <div className="settings-intro"><div className="large-icon"><Settings size={22} /></div><h2>Business settings</h2><p>Manage your company identity and the application theme used by your team.</p><div className="settings-note"><ShieldCheck size={16} /><span>Only Administrators may change business settings.</span></div></div>
              <div className="editor-card readonly-company">
                <div className="editor-heading"><div><h2>Business details</h2><p>All currency and tax values are stored with LKR as the base currency.</p></div>{user.role === "ADMIN" && <button className="primary-button" onClick={() => setCompanyEditorOpen(true)}>Edit business settings</button>}</div>
                {company ? <dl>{Object.entries(company).filter(([key]) => key !== "updatedAt" && key !== "id" && key !== "theme").map(([key, value]) => <div key={key}><dt>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</dt><dd>{String(value ?? "—")}</dd></div>)}<div><dt>Application theme</dt><dd>{businessThemeLabels[company.theme]}</dd></div></dl> : <p>No company profile has been configured yet.</p>}
              </div>
            </div>
          )}
          {page === "users" && (
            <ListPage title="Sales reps & user access" description="Create Sales Rep accounts, assign province or district areas, manage roles, and deactivate access." count={users.length} query={query} onQuery={updateQuery} action={<><button className="secondary-button" onClick={() => navigate("roles")}>Create custom role</button><button className="primary-button" onClick={() => { setEditingUser(null); setUserEditorOpen(true); }}>＋ Add user</button></>}>
              <div className="table-card"><UsersTable rows={userPage.rows} currentUser={user} onEdit={editUser} onToggle={(row) => void toggleUser(row)} /></div>
              <Pagination page={userPage.page} totalPages={userPage.totalPages} total={filteredUsers.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
            </ListPage>
          )}
          {page === "roles" && (
            <ListPage title="Roles & permissions" description="Review built-in access and create custom roles from a restricted set of permissions." count={roleAdminData.customRoles.length} query={query} onQuery={updateQuery} action={<button className="primary-button" onClick={() => { setEditingRole(null); setNewRoleBaseRole("SALES_REP"); setRoleEditorOpen(true); }}>＋ Create role</button>}>
              <section className="content-card">
                <div className="card-heading"><div><h2>Built-in roles</h2><p>System roles are fixed. Create a custom role to limit their permissions.</p></div><span className="record-count">{roleAdminData.builtInRoles.length} roles</span></div>
                <div className="table-card"><BuiltInRolesTable roles={roleAdminData.builtInRoles} permissionCatalog={roleAdminData.permissionCatalog} /></div>
              </section>
              <div className="table-card"><CustomRolesTable rows={roleAdminData.customRoles.filter((role) => `${role.name} ${roleLabels[role.baseRole]}`.toLowerCase().includes(query.toLowerCase()))} onEdit={editRole} onDelete={(role) => void deleteRole(role)} /></div>
              <p className="field-hint">To assign a custom role, open User access and select it when creating or editing a user. Custom roles can only reduce their base role's permissions.</p>
            </ListPage>
          )}
          {page === "notifications" && <ListPage title="Notifications" description="Review and manage operational alerts." count={notices.length} query={query} onQuery={updateQuery}><NotificationsPage notices={noticePage.rows} onAcknowledge={(id) => void updateNotice(id, "acknowledge")} onSnooze={(id) => void updateNotice(id, "snooze")} /><Pagination page={noticePage.page} totalPages={noticePage.totalPages} total={filteredNotices.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} /></ListPage>}
          {page === "security" && <div className="settings-layout">
            <div className="settings-intro"><div className="large-icon"><ShieldCheck size={22} /></div><h2>Account security</h2><p>Use a unique password for your TQMS account. Changing it signs out your other active sessions.</p></div>
            <div className="editor-card settings-form"><div className="editor-heading"><div><h2>Change password</h2><p>Choose at least 12 characters.</p></div><button className="primary-button" onClick={() => setPasswordEditorOpen(true)}>Update password</button></div></div>
          </div>}
          {editingSupplierPrice && <Modal title="Edit tender supplier price" onClose={() => setEditingSupplierPrice(null)}>
            <SupplierPriceEditForm price={editingSupplierPrice} onSave={(payload) => void updateSupplierPrice(editingSupplierPrice.id, payload)} onCancel={() => setEditingSupplierPrice(null)} />
          </Modal>}
          {(userEditorOpen || editingUser) && page === "users" && <Modal title={editingUser ? "Edit user" : "Create user"} onClose={() => { setEditingUser(null); setUserEditorOpen(false); }}>
            <form key={editingUser?.id ?? "new-user"} className="editor-card modal-form" onSubmit={(event) => void submitForm(event)}>
              <div className="editor-heading"><div><h2>{editingUser ? "Edit user" : "Create a user"}</h2><p>{editingUser ? "Update the user's details, account access, or assigned role." : "Set account details and choose a built-in or custom role."}</p></div><Users size={20} /></div>
              {error && <p className="feedback error-feedback" role="alert">{error}</p>}
              <div className="form-grid">
                <Field label="Full name" name="fullName" required defaultValue={editingUser?.fullName ?? ""} />
                <Field label="Email address" name="email" type="email" required defaultValue={editingUser?.email ?? ""} />
                <UserRoleAndAreaFields
                  builtInRoles={roleAdminData.builtInRoles}
                  customRoles={roleAdminData.customRoles}
                  areas={areas}
                  selectedRole={editingUser?.customRoleId ? `custom:${editingUser.customRoleId}` : editingUser?.role ?? "SALES_REP"}
                  assignments={editingUser?.areaAssignments ?? []}
                />
                {!editingUser && <Field label="Temporary password" name="password" type="password" minLength={12} required />}
                {editingUser && editingUser.id !== user.id && <Field label="Reset password (optional)" name="password" type="password" minLength={12} />}
              </div>
              {editingUser && editingUser.id !== user.id && <p className="field-hint">Setting a new password signs the user out of all active sessions.</p>}
              <div className="form-actions"><button className="primary-button" type="submit">{editingUser ? "Save user changes" : "Create user"}</button><button className="secondary-button" type="button" onClick={() => { setEditingUser(null); setUserEditorOpen(false); }}>Cancel</button></div>
            </form>
          </Modal>}
          {(roleEditorOpen || editingRole) && page === "roles" && <Modal title={editingRole ? "Edit custom role" : "Create custom role"} className="role-modal" onClose={() => { setEditingRole(null); setRoleEditorOpen(false); }}>
            <form key={editingRole?.id ?? "new-role"} className="editor-card modal-form role-editor-form" onSubmit={(event) => void submitForm(event)}>
              <div className="editor-heading"><div><h2>{editingRole ? "Edit custom role" : "Create a custom role"}</h2><p>Permissions can only reduce the selected built-in role's access.</p></div><ShieldCheck size={20} /></div>
              {error && <p className="feedback error-feedback" role="alert">{error}</p>}
              <div className="form-grid">
                <Field label="Role name" name="name" required defaultValue={editingRole?.name ?? ""} />
                {!editingRole && <label className="field"><span>Base role</span><select name="baseRole" value={newRoleBaseRole} onChange={(event) => setNewRoleBaseRole(event.target.value as Role)}>
                  {roleAdminData.builtInRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select></label>}
              </div>
              <div className="permission-list"><h3>Allowed permissions</h3><div key={editingRole?.baseRole ?? newRoleBaseRole}>{Object.entries(
                roleAdminData.permissionCatalog.filter((permission) => permission.roles.includes(editingRole?.baseRole ?? newRoleBaseRole)).reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
                  (groups[permission.module] ??= []).push(permission);
                  return groups;
                }, {}),
              ).map(([module, permissions]) => <fieldset className="permission-group" key={module}>
                <legend>{module}</legend>{permissions.map((permission) => <label className="permission-option" key={permission.id}><input type="checkbox" name="permissions" value={permission.id} defaultChecked={editingRole?.permissions.includes(permission.id) ?? false} /><span><strong>{permission.action}</strong><small>{permission.label}</small></span></label>)}
              </fieldset>)}</div></div>
              <div className="form-actions"><button className="primary-button" type="submit">{editingRole ? "Save role changes" : "Create role"}</button><button className="secondary-button" type="button" onClick={() => { setEditingRole(null); setRoleEditorOpen(false); }}>Cancel</button></div>
            </form>
          </Modal>}
          {institutionEditorOpen && page === "institutions" && <Modal title="Add institution" onClose={() => setInstitutionEditorOpen(false)}>
            <form className="editor-card modal-form" onSubmit={(event) => void submitForm(event)}>
              <div className="editor-heading"><div><h2>Add an institution</h2><p>Institutions are selected when supplier registrations are recorded.</p></div><Building2 size={20} /></div>
              {error && <p className="feedback error-feedback" role="alert">{error}</p>}
              <div className="form-grid">
                <Field label="Institution name" name="name" required />
                <AreaFields areas={areas} />
                <Field label="General contact number" name="contactNumber1" />
                <Field label="Address" name="address" />
              </div>
              <FormActions onCancel={() => setInstitutionEditorOpen(false)} label="Add institution" />
            </form>
          </Modal>}
          {companyEditorOpen && page === "company" && user.role === "ADMIN" && <Modal title="Edit business settings" onClose={() => setCompanyEditorOpen(false)}>
            <form className="editor-card modal-form settings-form" onSubmit={(event) => void submitForm(event)}>
              <div className="editor-heading"><div><h2>Business details</h2><p>All currency and tax values are stored with LKR as the base currency.</p></div><FileText size={20} /></div>
              {error && <p className="feedback error-feedback" role="alert">{error}</p>}
              <div className="form-grid">
                <Field label="Company name" name="companyName" required defaultValue={company?.companyName ?? ""} />
                <Field label="Business email" name="email" type="email" required defaultValue={company?.email ?? ""} />
                <Field label="Office phone 1" name="officePhone1" required defaultValue={company?.officePhone1 ?? ""} />
                <Field label="Office phone 2" name="officePhone2" defaultValue={company?.officePhone2 ?? ""} />
                <Field label="Business registration number" name="brNumber" required defaultValue={company?.brNumber ?? ""} />
                <Field label="VAT registration number" name="vatRegistrationNumber" required defaultValue={company?.vatRegistrationNumber ?? ""} />
                <Field label="Quotation validity (days)" name="quotationValidityDays" type="number" required defaultValue={company?.quotationValidityDays ?? 30} />
                <Field label="VAT rate (%)" name="vatRate" type="number" required defaultValue={company?.vatRate ?? 0} />
                <Field label="Minimum margin (%)" name="minimumMarginPercent" type="number" required defaultValue={company?.minimumMarginPercent ?? 0} />
                <label className="field"><span>Business theme</span><select name="theme" defaultValue={company?.theme ?? "forest"}><option value="forest">Forest green</option><option value="ocean">Ocean blue</option><option value="plum">Plum</option></select></label>
                <label className="field field-wide"><span>Business address</span><textarea name="address" required rows={3} defaultValue={company?.address ?? ""} /></label>
              </div>
              <FormActions onCancel={() => setCompanyEditorOpen(false)} label="Save company profile" />
            </form>
          </Modal>}
          {passwordEditorOpen && page === "security" && <Modal title="Change password" onClose={() => setPasswordEditorOpen(false)}>
            <form className="editor-card modal-form settings-form" onSubmit={(event) => void changePassword(event)}>
              <div className="editor-heading"><div><h2>Change password</h2><p>Choose at least 12 characters.</p></div><KeyRound size={20} /></div>
              {error && <p className="feedback error-feedback" role="alert">{error}</p>}
              <div className="form-grid">
                <Field label="Current password" name="currentPassword" type="password" required />
                <span />
                <Field label="New password" name="newPassword" type="password" minLength={12} required />
                <Field label="Confirm new password" name="confirmPassword" type="password" minLength={12} required />
              </div>
              <FormActions onCancel={() => setPasswordEditorOpen(false)} label="Update password" />
            </form>
          </Modal>}
        </div>
        <footer className="page-footer"><span>© {today.getFullYear()} TQMS · Tender Quotation Management System</span><span><Archive size={14} /> Data is stored on your configured server</span></footer>
      </main>
    </div>
  );
}

function Login({ onLogin, initialError }: { onLogin: (email: string, password: string) => Promise<void>; initialError: string }) {
  const [year] = useState(() => new Date().getFullYear());
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      await onLogin(String(values.get("email")), String(values.get("password")));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }
  return <div className="login-page">
    <div className="login-decoration"><div className="decoration-grid" /><div className="login-orbit orbit-one" /><div className="login-orbit orbit-two" /><div className="login-brand"><div className="brand-mark">T</div><span>TQMS</span></div><div className="login-pitch"><div className="eyebrow">TENDER MANAGEMENT, MADE CLEAR</div><h1>Every tender.<br />One clear view.</h1><p>Organise supplier registrations, pricing and competitor intelligence in a single workspace.</p><div className="login-feature"><span><ClipboardList size={17} /></span>Manage the complete tender lifecycle</div><div className="login-feature"><span><Activity size={17} /></span>Turn tender data into better decisions</div></div><div className="decoration-caption">BUILT FOR BETTER BIDS <i /></div></div>
    <div className="login-panel"><form className="login-form" onSubmit={(event) => void submit(event)}><div className="login-mobile-brand"><div className="brand-mark">T</div><strong>TQMS</strong></div><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your account</h2><p>Enter your work credentials to access the workspace.</p>{error && <div className="feedback error-feedback" role="alert">{error}</div>}<label className="field"><span>Email address</span><input name="email" type="email" autoComplete="username" placeholder="you@company.lk" required /></label><label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></label><button className="primary-button login-submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}<span>→</span></button><div className="login-security"><ShieldCheck size={15} /> Secure, role-based access</div></form><div className="login-copyright">© {year} TQMS · Tender Quotation Management System</div></div>
  </div>;
}

function DashboardPage({ data, onNavigate }: { data?: Dashboard; onNavigate: (page: Page) => void }) {
  const stats = [
    { label: "Active items", value: data?.counts.activeItems ?? 0, icon: Package, color: "mint", note: "In your catalogue" },
    { label: "Competitors", value: data?.counts.competitors ?? 0, icon: Users, color: "blue", note: "Tracked companies" },
    { label: "Registrations", value: data?.counts.registrations ?? 0, icon: ClipboardList, color: "violet", note: "Current and upcoming" },
    { label: "Tenders closing this week", value: data?.closingThisWeek ?? 0, icon: Bell, color: "amber", note: "Upcoming deadlines" },
    { label: "Tenders closing today", value: data?.closingToday ?? 0, icon: Bell, color: "red", note: "Immediate attention" },
    { label: "Registrations expiring this week", value: data?.registrationExpiryWithinWeek ?? 0, icon: Bell, color: "amber", note: "Renewal deadlines" },
  ];
  return <div className="dashboard-content">
    <div className="stats-grid">{stats.map(({ label, value, icon: Icon, color, note }) => <div className="stat-card" key={label}><div className={`stat-icon ${color}`}><Icon size={19} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value.toLocaleString()}</strong><span className="stat-note">{note}</span></div>)}</div>
    <div className="dashboard-columns">
      <section className="content-card attention-card"><div className="card-heading"><div><h2>Needs attention</h2><p>Stay ahead of upcoming operational deadlines.</p></div><button className="text-button" onClick={() => onNavigate("notifications")}>View alerts <span>→</span></button></div>
        {(data?.notifications ?? []).length === 0 ? <EmptyState icon={<Bell size={20} />} title="You're all caught up" message="Registration expiry and tender closing reminders will appear here." /> :
          <div className="attention-list">{data?.notifications.slice(0, 5).map((notice) => <div className="attention-row" key={notice.id}><div className="attention-marker"><Bell size={15} /></div><div className="attention-copy"><strong>{notice.title}</strong><span>{notice.message}</span></div><span className="notice-date">{formatDate(notice.createdAt)}</span></div>)}</div>}
      </section>
      <section className="content-card quick-card"><div className="card-heading"><div><h2>Quick access</h2><p>Go straight to the tools you use most.</p></div></div><div className="quick-links"><button onClick={() => onNavigate("tenders")}><span className="quick-icon amber"><ClipboardList size={18} /></span><span><strong>Tender register</strong><small>Capture tenders and prepare quotations</small></span><b>→</b></button><button onClick={() => onNavigate("items")}><span className="quick-icon mint"><Package size={18} /></span><span><strong>Manage items</strong><small>Update your product catalogue</small></span><b>→</b></button><button onClick={() => onNavigate("competitors")}><span className="quick-icon blue"><Users size={18} /></span><span><strong>Competitor directory</strong><small>Review tracked companies</small></span><b>→</b></button><button onClick={() => onNavigate("registrations")}><span className="quick-icon violet"><ClipboardList size={18} /></span><span><strong>Supplier registrations</strong><small>Review renewals and expiry</small></span><b>→</b></button></div></section>
    </div>
    <div className="phase-banner"><div className="phase-icon"><Activity size={20} /></div><div><strong>Your Phase 1 workspace is ready</strong><span>Company settings, user access, item master, competitors and supplier registration tracking are available.</span></div><span className="phase-chip">FOUNDATION</span></div>
  </div>;
}

function ReportsPage({ report, accuracy, loading, onApplyFilters }: {
  report: TenderReport | null;
  accuracy: PredictionAccuracy | null;
  loading: boolean;
  onApplyFilters: (filters: Record<string, string>) => Promise<void>;
}) {
  const [filters, setFilters] = useState({ from: "", to: "", status: "", representativeId: "" });
  const [filterLoading, setFilterLoading] = useState(false);
  if (!report) return loading
    ? <div className="loading-line"><span />Loading tender reports…</div>
    : <div className="reports-unavailable"><EmptyState icon={<BarChart3 size={20} />} title="Reports are unavailable" message="See the error above and try again." /><button type="button" className="secondary-button" disabled={filterLoading} onClick={() => void fetchReport({})}>Retry</button></div>;
  const reportData = report;
  const summary = reportData.summary;
  async function fetchReport(nextFilters: Record<string, string>) {
    setFilterLoading(true);
    try {
      await onApplyFilters(nextFilters);
    } finally {
      setFilterLoading(false);
    }
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void fetchReport(filters);
  }
  function exportReport() {
    const header = ["Tender reference", "Institution", "Province", "District", "Representative", "Closing date", "Status", "Awarded value (LKR)", "Purchase order value (LKR)", "Orders", "Delivery status", "Payment", "Performance bonds"];
    const rows = reportData.tenders.map((tender) => [
      tender.referenceNumber,
      tender.institution.name,
      tender.province,
      tender.district,
      tender.responsibleRep.fullName,
      new Date(tender.closingAt).toISOString().slice(0, 10),
      tender.status,
      tender.awardedValue.toFixed(2),
      tender.purchaseOrderValue.toFixed(2),
      String(tender.purchaseOrders.length),
      tender.purchaseOrders.map((order) => `${order.poNumber}: ${order.deliveryStatus}`).join("; "),
      tender.purchaseOrders.map((order) => `${order.poNumber}: ${order.paymentReceived ? "Paid" : "Unpaid"}`).join("; "),
      tender.purchaseOrders.filter((order) => order.performanceBondRequired).map((order) => `${order.poNumber}: ${order.performanceBondStatus}`).join("; "),
    ]);
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = [header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tqms-tender-report.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportWorkbook() {
    const tenderHeaders = ["Tender reference", "Institution", "Province", "District", "Representative", "Closing date", "Status", "Awarded value (LKR)", "Purchase order value (LKR)", "Orders", "Delivery status", "Payment", "Performance bonds"];
    const tenderRows = reportData.tenders.map((tender) => [
      tender.referenceNumber,
      tender.institution.name,
      tender.province,
      tender.district,
      tender.responsibleRep.fullName,
      new Date(tender.closingAt).toISOString().slice(0, 10),
      tender.status,
      tender.awardedValue,
      tender.purchaseOrderValue,
      tender.purchaseOrders.length,
      tender.purchaseOrders.map((order) => `${order.poNumber}: ${order.deliveryStatus}`).join("; "),
      tender.purchaseOrders.map((order) => `${order.poNumber}: ${order.paymentReceived ? "Paid" : "Unpaid"}`).join("; "),
      tender.purchaseOrders.filter((order) => order.performanceBondRequired).map((order) => `${order.poNumber}: ${order.performanceBondStatus}`).join("; "),
    ]);
    const file = createXlsxWorkbook([
      {
        name: "Summary",
        rows: [
          ["TQMS Tender Report"],
          ["Generated", formatDate(reportData.generatedAt)],
          ["Matching tenders", reportData.totalMatching],
          ["Tenders in export", summary.tenderCount],
          ["Won", summary.wonCount],
          ["Lost", summary.lostCount],
          ["Win rate (%)", summary.winRate],
          ["Awarded value (LKR)", summary.awardedValue],
          ["Purchase order value (LKR)", summary.purchaseOrderValue],
          ["Orders awaiting delivery", summary.pendingDeliveryOrders],
          ["Unpaid orders", summary.unpaidOrders],
          ["Outstanding bonds", summary.outstandingBonds],
        ],
      },
      {
        name: "Areas",
        rows: [
          ["Province", "District", "Tenders", "Won", "Lost", "Awarded value (LKR)", "Purchase order value (LKR)"],
          ...reportData.byArea.map((area) => [area.province, area.district, area.tenderCount, area.wonCount, area.lostCount, area.awardedValue, area.purchaseOrderValue]),
        ],
      },
      {
        name: "Representatives",
        rows: [
          ["Representative", "Tenders", "Won", "Lost", "Awarded value (LKR)"],
          ...reportData.byRepresentative.map((rep) => [rep.name, rep.tenderCount, rep.wonCount, rep.lostCount, rep.awardedValue]),
        ],
      },
      {
        name: "Institutions",
        rows: [
          ["Institution", "Tenders", "Won", "Lost", "Awarded value (LKR)"],
          ...reportData.byInstitution.map((institution) => [institution.name, institution.tenderCount, institution.wonCount, institution.lostCount, institution.awardedValue]),
        ],
      },
      {
        name: "Competitors",
        rows: [
          ["Competitor", "Comparable bids", "Average bid (LKR)", "Lowest bid count"],
          ...reportData.competitors.map((competitor) => [competitor.name, competitor.bids, competitor.averageBid, competitor.lowestBidCount]),
        ],
      },
      { name: "Tender outcomes", rows: [tenderHeaders, ...tenderRows] },
    ]);
    const workbookBuffer = new ArrayBuffer(file.byteLength);
    new Uint8Array(workbookBuffer).set(file);
    const url = URL.createObjectURL(new Blob([workbookBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tqms-tender-report.xlsx";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="reports-page">
    <form className="report-filters" onSubmit={apply}>
      <label className="field"><span>Closing date from</span><input name="from" type="date" disabled={filterLoading} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label className="field"><span>Closing date to</span><input name="to" type="date" disabled={filterLoading} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <label className="field"><span>Tender status</span><select disabled={filterLoading} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
        <option value="">All statuses</option>
        {["NEW", "PRICE_REQUESTED", "QUOTED", "SUBMITTED", "TENDER_READING_DONE", "AWARDED", "LOST", "CANCELLED", "PO_RECEIVED", "COMPLETED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
      </select></label>
      <label className="field"><span>Representative</span><select disabled={filterLoading} value={filters.representativeId} onChange={(event) => setFilters({ ...filters, representativeId: event.target.value })}>
        <option value="">All representatives</option>
        {reportData.byRepresentative.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
      </select></label>
      <div className="report-filter-actions"><button className="primary-button" disabled={filterLoading}>{filterLoading ? "Applying…" : "Apply filters"}</button><button type="button" className="secondary-button" disabled={filterLoading} onClick={() => {
        const cleared = { from: "", to: "", status: "", representativeId: "" };
        setFilters(cleared);
        void fetchReport(cleared);
      }}>Clear</button><button type="button" className="secondary-button" disabled={filterLoading} onClick={exportReport}>Export CSV</button><button type="button" className="secondary-button" disabled={filterLoading} onClick={exportWorkbook}>Export Excel</button><button type="button" className="secondary-button" disabled={filterLoading} onClick={() => window.print()}>Print / Save PDF</button></div>
    </form>

    {reportData.truncated && <div className="feedback error-feedback">Showing the latest 500 of {reportData.totalMatching} matching tenders. Add filters to narrow this report.</div>}
    <div className="report-stat-grid">
      <ReportStat label="Tenders in report" value={summary.tenderCount.toLocaleString()} note={`${summary.wonCount} won · ${summary.lostCount} lost`} />
      <ReportStat label="Win rate" value={`${summary.winRate.toFixed(1)}%`} note="Won from decided tenders" />
      <ReportStat label="Awarded value" value={currency(summary.awardedValue)} note="Our awarded item lines" />
      <ReportStat label="PO value" value={currency(summary.purchaseOrderValue)} note="Recorded purchase orders" />
      <ReportStat label="Orders awaiting delivery" value={summary.pendingDeliveryOrders.toLocaleString()} note={`${summary.unpaidOrders} unpaid`} />
      <ReportStat label="Outstanding bonds" value={summary.outstandingBonds.toLocaleString()} note={`${summary.deliveredOrders} orders delivered`} />
    </div>

    <div className="report-grid">
      <ReportGroup title="Performance by representative" columns={["Representative", "Tenders", "Won", "Lost", "Awarded value"]} rows={reportData.byRepresentative.map((rep) => [rep.name, String(rep.tenderCount), String(rep.wonCount), String(rep.lostCount), currency(rep.awardedValue)])} />
      <ReportGroup title="Performance by institution" columns={["Institution", "Tenders", "Won", "Lost", "Awarded value"]} rows={reportData.byInstitution.map((institution) => [institution.name, String(institution.tenderCount), String(institution.wonCount), String(institution.lostCount), currency(institution.awardedValue)])} />
    </div>
    <ReportGroup title="Performance by area" columns={["Province", "District", "Tenders", "Won", "Lost", "Awarded value", "PO value"]} rows={reportData.byArea.map((area) => [area.province, area.district, String(area.tenderCount), String(area.wonCount), String(area.lostCount), currency(area.awardedValue), currency(area.purchaseOrderValue)])} />
    <ReportGroup title="Competitor bid intelligence" columns={["Competitor", "Comparable bids", "Average bid", "Lowest bid count"]} rows={reportData.competitors.map((competitor) => [competitor.name, String(competitor.bids), currency(competitor.averageBid), String(competitor.lowestBidCount)])} />
    <section className="content-card report-group">
      <div className="card-heading"><div><h2>Price prediction accuracy</h2><p>Predicted most-likely item price compared with the recorded award price.</p></div></div>
      {!accuracy || !accuracy.evaluatedCount
        ? <p className="results-empty">No completed price predictions can be evaluated yet. Predictions are scored after an award is recorded.</p>
        : <>
          <div className="report-stat prediction-accuracy-stat"><span>Mean absolute percentage error (MAPE)</span><strong>{accuracy.meanAbsolutePercentageError?.toFixed(2)}%</strong><small>Based on {accuracy.evaluatedCount} recorded prediction outcome(s); lower is better.</small></div>
          <div className="table-card"><table><thead><tr><th>TENDER</th><th>ITEM</th><th>PREDICTED UNIT PRICE</th><th>ACTUAL UNIT PRICE</th><th>ERROR</th><th>PREDICTED</th></tr></thead><tbody>
            {accuracy.records.map((record) => <tr key={record.id}><td>{record.tenderReference}</td><td>{record.itemDescription}</td><td>{currency(record.predictedPrice)}</td><td>{currency(record.actualPrice)}</td><td>{record.errorPercent.toFixed(2)}%</td><td>{formatDate(record.predictionDate)}</td></tr>)}
          </tbody></table></div>
        </>}
    </section>
    <section className="content-card report-table-section">
      <div className="card-heading"><div><h2>Tender outcomes</h2><p>Closing date, awards, order delivery, payment, and bond status.</p></div><span className="record-count">{reportData.totalMatching} matching</span></div>
      {reportData.tenders.length === 0 ? <EmptyState icon={<BarChart3 size={20} />} title="No tenders match these filters" message="Change the dates, status, or representative to see results." /> : <div className="table-card"><table className="report-tenders-table">
        <thead><tr><th>TENDER</th><th>AREA</th><th>CLOSING</th><th>REPRESENTATIVE</th><th>STATUS</th><th>AWARDED</th><th>PO VALUE</th><th>DELIVERY / PAYMENT / BOND</th></tr></thead>
        <tbody>{reportData.tenders.map((tender) => <tr key={tender.id}>
          <td><strong>{tender.referenceNumber}</strong><small className="sub-cell">{tender.institution.name}</small></td>
          <td>{[tender.district, tender.province].filter(Boolean).join(", ") || "Unassigned"}</td><td>{formatDate(tender.closingAt)}</td><td>{tender.responsibleRep.fullName}</td><td><StatusBadge status={tender.status} /></td>
          <td>{currency(tender.awardedValue)}</td><td>{currency(tender.purchaseOrderValue)}</td>
          <td>{tender.purchaseOrders.length ? tender.purchaseOrders.map((order) => <small className="report-order-state" key={order.poNumber}>{order.poNumber}: {order.deliveryStatus} · {order.paymentReceived ? "Paid" : "Unpaid"}{order.performanceBondRequired ? ` · Bond ${order.performanceBondStatus}` : ""}</small>) : "No purchase order"}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <p className="report-generated-at">Generated {formatDate(reportData.generatedAt)} · Dates filter on tender closing date.</p>
  </div>;
}

function ReportStat({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="report-stat"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function ReportGroup({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return <section className="content-card report-group">
    <div className="card-heading"><div><h2>{title}</h2></div><span className="record-count">{rows.length} groups</span></div>
    {rows.length ? <div className="table-card"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="results-empty">No data for this report period.</p>}
  </section>;
}

function Modal({ title, className = "", onClose, children }: { title: string; className?: string; onClose: () => void; children: ReactNode }) {
  return <div
    className="modal-overlay"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape") onClose();
    }}
  >
    <div className={`modal-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      {children}
    </div>
  </div>;
}

function ListPage({ title, description, count, query, onQuery, action, children }: { title: string; description: string; count: number; query: string; onQuery: (value: string) => void; action?: ReactNode; children: ReactNode }) {
  return <div className="list-page"><div className="list-toolbar"><div className="list-context"><div><h2>{title}</h2><p>{description}</p></div><span className="record-count">{count} records</span></div><div className="toolbar-actions"><label className="search-field"><Search size={16} /><input placeholder="Search records…" value={query} onChange={(event) => onQuery(event.target.value)} /><kbd>⌘ K</kbd></label>{action}</div></div>{children}</div>;
}

function Pagination({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange }: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return <div className="pagination">
    <span>{total === 0 ? "No records" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
    <div className="pagination-actions">
      <label>Rows
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      <span>Page {page} of {totalPages}</span>
      <button type="button" className="secondary-button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
    </div>
  </div>;
}

type TenderLineDraft = {
  itemId: string;
  description: string;
  specification: string;
  quantity: string;
  unit: string;
  estimatedUnitPrice: string;
};

function TenderCreateForm({ institutions, reps, areas, banks, currentUser, onSubmit, onCancel }: {
  institutions: Institution[];
  reps: { id: string; fullName: string; email: string; role: Role }[];
  areas: Area[];
  banks: SriLankaBank[];
  currentUser: User;
  onSubmit: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<TenderRecord["type"]>("OPEN");
  const [lines, setLines] = useState<TenderLineDraft[]>([{ itemId: "", description: "", specification: "", quantity: "1", unit: "", estimatedUnitPrice: "" }]);
  function updateLine(index: number, patch: Partial<TenderLineDraft>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSubmit({
      referenceNumber: values.get("referenceNumber"),
      type,
      institutionId: values.get("institutionId"),
      source: values.get("source") || null,
      letterReceivedAt: values.get("letterReceivedAt") || null,
      visitAt: values.get("visitAt") || null,
      contactOfficer: values.get("contactOfficer") || null,
      closingAt: values.get("closingAt") ? new Date(String(values.get("closingAt"))).toISOString() : null,
      province: values.get("province") || null,
      district: values.get("district") || null,
      responsibleRepId: values.get("responsibleRepId"),
      bidBondRequired: values.has("bidBondRequired"),
      bidBondAmount: values.get("bidBondAmount") ? Number(values.get("bidBondAmount")) : null,
      bidBondBank: values.get("bidBondBank") || null,
      bidBondNumber: values.get("bidBondNumber") || null,
      bidBondIssueDate: values.get("bidBondIssueDate") || null,
      bidBondExpiryDate: values.get("bidBondExpiryDate") || null,
      bidBondStatus: values.get("bidBondStatus") || null,
      notes: values.get("notes") || null,
      items: lines.map((line) => ({
        itemId: line.itemId || null,
        description: line.description,
        specification: line.specification || null,
        quantity: Number(line.quantity),
        unit: line.unit || "Each",
        estimatedUnitPrice: line.estimatedUnitPrice ? Number(line.estimatedUnitPrice) : null,
      })),
    });
  }
  return <form className="editor-card modal-form tender-create-form" onSubmit={submit}>
    <div className="editor-heading"><div><h2>Capture a tender</h2><p>Enter the notice details and requested line items.</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Close tender form"><X size={18} /></button></div>
    <div className="form-grid">
      <Field label="Tender / reference number" name="referenceNumber" required />
      <label className="field"><span>Tender type <i>*</i></span><select name="type" value={type} onChange={(event) => setType(event.target.value as TenderRecord["type"])}><option value="OPEN">Open tender</option><option value="LETTERS">Letters</option><option value="WALK_IN">Walk-In</option></select></label>
      <label className="field"><span>Customer / institution <i>*</i></span><select name="institutionId" required defaultValue=""><option value="" disabled>Select institution</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
      <label className="field"><span>Responsible representative <i>*</i></span><select name="responsibleRepId" required defaultValue={currentUser.role === "SALES_REP" ? currentUser.id : ""}><option value="" disabled>Select representative</option>{reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.fullName} · {roleLabels[rep.role]}</option>)}</select></label>
      <Field label="Closing date and time" name="closingAt" type="datetime-local" required />
      {type === "OPEN" && <Field label="Source (newspaper / website / gazette)" name="source" />}
      {type === "LETTERS" && <Field label="Letter received date" name="letterReceivedAt" type="date" />}
      {type === "WALK_IN" && <><Field label="Visit date" name="visitAt" type="date" /><Field label="Contact officer" name="contactOfficer" /></>}
      <AreaFields areas={areas} />
      <label className="field field-wide tender-bond-checkbox"><span><input name="bidBondRequired" type="checkbox" /> Bid bond required</span></label>
      <Field label="Bid bond amount (LKR)" name="bidBondAmount" type="number" />
      <label className="field"><span>Bond bank</span><select name="bidBondBank" defaultValue=""><option value="">Select bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name} · {bank.code}</option>)}</select></label>
      <Field label="Bond number" name="bidBondNumber" />
      <Field label="Bond issue date" name="bidBondIssueDate" type="date" />
      <Field label="Bond expiry date" name="bidBondExpiryDate" type="date" />
      <label className="field"><span>Bond status</span><select name="bidBondStatus" defaultValue="REQUESTED"><option value="REQUESTED">Requested</option><option value="ISSUED">Issued</option><option value="SUBMITTED">Submitted</option><option value="RETURNED">Returned</option><option value="EXPIRED">Expired</option></select></label>
      <label className="field field-wide"><span>Notes</span><textarea name="notes" rows={2} /></label>
    </div>
    <div className="tender-lines-heading"><h3>Requested items</h3><button type="button" className="secondary-button" onClick={() => setLines((current) => [...current, { itemId: "", description: "", specification: "", quantity: "1", unit: "", estimatedUnitPrice: "" }])}>＋ Add line</button></div>
    <div className="tender-draft-lines">{lines.map((line, index) => <div className="tender-draft-line" key={index}>
      <label className="field"><span>Item master (search or choose custom)</span><TenderItemPicker value={line.itemId} onSelect={(selected) => {
        updateLine(index, { itemId: selected?.id ?? "", description: selected?.name ?? "", unit: selected?.unit.name ?? "" });
      }} /></label>
      <label className="field"><span>Description <i>*</i></span><input required maxLength={200} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></label>
      <label className="field"><span>Specification</span><input maxLength={1000} value={line.specification} onChange={(event) => updateLine(index, { specification: event.target.value })} /></label>
      <label className="field"><span>Quantity <i>*</i></span><input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
      <label className="field"><span>Unit <i>*</i></span><input required maxLength={50} value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} /></label>
      <label className="field"><span>Customer estimate (LKR)</span><input type="number" min="0" step="0.01" value={line.estimatedUnitPrice} onChange={(event) => updateLine(index, { estimatedUnitPrice: event.target.value })} /></label>
      {lines.length > 1 && <button type="button" className="text-button remove-tender-line" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove line</button>}
    </div>)}</div>
    <FormActions onCancel={onCancel} label="Save tender" />
  </form>;
}

function TenderItemPicker({ value, onSelect }: {
  value: string;
  onSelect: (item: Item | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { items, loading, error, setLoading } = useItemSearch(open, query);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
        setLoading(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open, setLoading]);

  function chooseItem(item: Item | null) {
    setSelectedItem(item);
    onSelect(item);
    setQuery("");
    setOpen(false);
    setLoading(false);
  }

  function toggleMenu() {
    setOpen((current) => !current);
    setQuery("");
    setLoading(!open);
  }

  return <div className="tender-item-picker" ref={pickerRef}>
    <button
      type="button"
      className="tender-item-picker-trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={toggleMenu}
    >
      <span>{selectedItem ? `${selectedItem.name} · ${selectedItem.code}` : "Choose an item or custom description"}</span>
      <ChevronDown size={16} />
    </button>
    {open && <div className="tender-item-picker-menu">
      <label className="tender-item-picker-search">
        <Search size={15} />
        <input
          type="search"
          role="combobox"
          aria-label="Search tender items"
          aria-autocomplete="list"
          aria-expanded={open}
          autoFocus
          placeholder="Search by item name or code"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLoading(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
              setLoading(false);
            }
          }}
        />
      </label>
      <div className="tender-item-picker-options" role="listbox" aria-label="Tender items">
        <button type="button" role="option" aria-selected={!value} onClick={() => chooseItem(null)}>
          Custom tender item
        </button>
        {loading && <p>Searching items…</p>}
        {!loading && error && <p>{error}</p>}
        {!loading && !error && items.map((item) => <button
          type="button"
          role="option"
          aria-selected={item.id === value}
          key={item.id}
          onClick={() => chooseItem(item)}
        >
          <strong>{item.name}</strong>
          <small>{item.code}{item.category?.name ? ` · ${item.category.name}` : ""}</small>
        </button>)}
        {!loading && !error && items.length === 0 && <p>{query ? "No matching items." : "No active items available."}</p>}
      </div>
    </div>}
  </div>;
}

function useItemSearch(open: boolean, query: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchItemOptions(query)
        .then((results) => {
          if (!cancelled) {
            setItems(results);
            setError("");
          }
        })
        .catch((reason) => {
          if (!cancelled) {
            setItems([]);
            setError(reason instanceof Error ? reason.message : "Unable to search items.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  return { items, loading, error, setLoading };
}

function RegistrationItemPicker() {
  const [selectedItems, setSelectedItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const { items, loading, error, setLoading } = useItemSearch(open, query);
  const selectedIds = new Set(selectedItems.map((item) => item.id));
  const availableItems = items.filter((item) => !selectedIds.has(item.id));

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
        setLoading(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open, setLoading]);

  function addItem(item: Item) {
    setSelectedItems((current) => [...current, item]);
    setQuery("");
    setLoading(true);
  }

  function toggleMenu() {
    setOpen((current) => !current);
    setQuery("");
    setLoading(!open);
  }

  return <div className="registration-item-selector">
    <div className="registration-item-picker" ref={pickerRef}>
      <button
        type="button"
        className="registration-item-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <span>{selectedItems.length ? `Add another item · ${selectedItems.length} selected` : "Search and add items"}</span>
        <ChevronDown size={16} />
      </button>
      {open && <div className="registration-item-picker-menu">
        <label className="registration-item-picker-search">
          <Search size={15} />
          <input
            type="search"
            role="combobox"
            aria-label="Search registered items"
            aria-autocomplete="list"
            aria-expanded={open}
            autoFocus
            placeholder="Search by item name or code"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLoading(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                setQuery("");
                setLoading(false);
              }
            }}
          />
        </label>
        <div className="registration-item-picker-options" role="listbox" aria-label="Available items" aria-multiselectable="true">
          {loading && <p>Searching items…</p>}
          {!loading && error && <p>{error}</p>}
          {!loading && !error && availableItems.map((item) => <button
            type="button"
            role="option"
            aria-selected="false"
            key={item.id}
            onClick={() => addItem(item)}
          >
            <strong>{item.name}</strong>
            <small>{item.code}{item.category?.name ? ` · ${item.category.name}` : ""}</small>
          </button>)}
          {!loading && !error && availableItems.length === 0 && <p>{items.length ? "All matching items are already selected." : query ? "No matching items." : "No active items available."}</p>}
        </div>
      </div>}
    </div>
    {selectedItems.length
      ? <ul className="registration-selected-items">
        {selectedItems.map((item) => <li key={item.id}>
          <span><strong>{item.name}</strong><small>{item.code}</small></span>
          <button type="button" className="text-button" aria-label={`Remove ${item.name}`} onClick={() => setSelectedItems((current) => current.filter(({ id }) => id !== item.id))}>Remove</button>
          <input type="hidden" name="itemIds" value={item.id} />
        </li>)}
      </ul>
      : <small className="field-hint">No items selected.</small>}
  </div>;
}

function TendersTable({ rows, selectedId, onSelect }: { rows: TenderRecord[]; selectedId?: string; onSelect: (id: string) => void }) {
  return <table><thead><tr><th>TENDER ID</th><th>REFERENCE / CUSTOMER</th><th>TYPE</th><th>CLOSING</th><th>REP</th><th>ITEMS</th><th>STATUS</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={selectedId === row.id ? "selected-tender-row" : ""}>
    <td><strong>{formatTenderNumber(row.tenderNumber)}</strong></td>
    <td><div className="primary-cell"><span className="institution-avatar"><ClipboardList size={16} /></span><span><strong>{row.referenceNumber}</strong><small>{row.institution.name}{row.registrationWarning ? " · Registration warning" : ""}</small></span></div></td>
    <td>{row.type.replace("_", " ")}</td><td>{formatDate(row.closingAt)}<small className="sub-cell">{new Intl.DateTimeFormat("en-LK", { hour: "numeric", minute: "2-digit" }).format(new Date(row.closingAt))}</small></td>
    <td>{row.responsibleRep.fullName}</td><td>{row.items.length}</td><td><StatusBadge status={row.status} /></td>
    <td><button className="text-button" aria-label={`Open tender ${row.referenceNumber}`} onClick={() => onSelect(row.id)}>Open</button></td>
  </tr>)}</tbody></table>;
}

function PricePredictionPanel({ tender, onPredict, onUseRecommendation }: {
  tender: TenderRecord;
  onPredict: (tenderId: string, itemId: string, payload: Record<string, unknown>) => Promise<PricePrediction>;
  onUseRecommendation: (itemId: string, price: number) => void;
}) {
  return <section className="price-prediction-panel">
    <div className="results-heading"><div><p className="eyebrow">PHASE 5 · ADVISORY ONLY</p><h3>Price guessing model</h3></div></div>
    <p className="prediction-intro">Estimate the likely winning unit price from past awards and competitor bids. The model requires at least 100 tender readings and sufficient history for the selected item.</p>
    {tender.items.map((item) => <PricePredictionItem key={item.id} tender={tender} item={item} onPredict={onPredict} onUseRecommendation={onUseRecommendation} />)}
  </section>;
}

function PricePredictionItem({ tender, item, onPredict, onUseRecommendation }: {
  tender: TenderRecord;
  item: TenderLine;
  onPredict: (tenderId: string, itemId: string, payload: Record<string, unknown>) => Promise<PricePrediction>;
  onUseRecommendation: (itemId: string, price: number) => void;
}) {
  const [chosenBidPrice, setChosenBidPrice] = useState("");
  const [targetWinProbability, setTargetWinProbability] = useState("60");
  const [prediction, setPrediction] = useState<PricePrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function requestPrediction() {
    setLoading(true);
    setError("");
    try {
      setPrediction(await onPredict(tender.id, item.id, {
        chosenBidPrice: chosenBidPrice ? Number(chosenBidPrice) : null,
        targetWinProbability: Number(targetWinProbability) / 100,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Price prediction could not be calculated.");
    } finally {
      setLoading(false);
    }
  }
  return <article className="prediction-item">
    <div className="prediction-item-heading"><div><strong>{item.description}</strong><span>{item.quantity} {item.unit} · {item.item?.code ?? "Not linked to item master"}</span></div></div>
    <div className="prediction-controls">
      <label className="field"><span>Your proposed bid / unit (LKR)</span><input type="number" min="0" step="0.01" value={chosenBidPrice} onChange={(event) => setChosenBidPrice(event.target.value)} placeholder="Optional" /></label>
      <label className="field"><span>Target win probability</span><select value={targetWinProbability} onChange={(event) => setTargetWinProbability(event.target.value)}><option value="50">50%</option><option value="60">60%</option><option value="70">70%</option><option value="80">80%</option><option value="90">90%</option></select></label>
      <button type="button" className="secondary-button prediction-button" disabled={loading} onClick={() => void requestPrediction()}>{loading ? "Estimating…" : "Estimate price"}</button>
    </div>
    {error && <p className="feedback error-feedback" role="alert">{error}</p>}
    {prediction && <div className={`prediction-result ${prediction.status === "INSUFFICIENT_DATA" ? "prediction-insufficient" : ""}`}>
      {prediction.status === "INSUFFICIENT_DATA" ? <>
        <strong>Not enough data to make a reliable estimate</strong>
        <ul>{prediction.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <span>Item award samples: {prediction.winningSampleCount} · competitor item-price readings: {prediction.competitorSampleCount}.</span>
      </> : <>
        <div className="prediction-metrics">
          <div><span>Likely winning unit price range</span><strong>{prediction.predictedPriceRange ? `${prediction.predictedPriceRange.low !== null ? currency(prediction.predictedPriceRange.low) : "—"} – ${prediction.predictedPriceRange.high !== null ? currency(prediction.predictedPriceRange.high) : "—"}` : "—"}</strong><small>Most likely {prediction.predictedPriceRange?.mostLikely !== null && prediction.predictedPriceRange?.mostLikely !== undefined ? currency(prediction.predictedPriceRange.mostLikely) : "—"}</small></div>
          <div><span>Recommended bid / unit</span><strong>{prediction.recommendedBidPrice !== null ? currency(prediction.recommendedBidPrice) : "—"}</strong><small>Targets {Math.round((prediction.targetWinProbability ?? 0) * 100)}% historical win probability</small></div>
          {prediction.customerEstimatedUnitPrice !== null && <div><span>Customer estimate / unit</span><strong>{currency(prediction.customerEstimatedUnitPrice)}</strong><small>Reference from this tender; shown separately from the model range</small></div>}
          {prediction.averageOwnPastBid !== null && <div><span>Our average past bid / unit</span><strong>{currency(prediction.averageOwnPastBid)}</strong><small>From {prediction.ownPastBidCount} recorded bid(s)</small></div>}
          {prediction.chosenWinProbability !== null && <div><span>Estimated chance at your bid</span><strong>{Math.round(prediction.chosenWinProbability * 100)}%</strong><small>Based on recorded competitor item prices</small></div>}
          {prediction.expectedGrossProfit !== null && <div><span>Estimated gross profit at your bid</span><strong>{currency(prediction.expectedGrossProfit)}</strong><small>{prediction.profitNote}</small></div>}
          {prediction.currentUnitCost !== null && prediction.recommendedGrossProfit !== null && <div><span>Estimated gross profit at recommendation</span><strong>{currency(prediction.recommendedGrossProfit)}</strong><small>{prediction.profitNote}</small></div>}
        </div>
        <p className="prediction-confidence">Confidence: <strong>{prediction.confidence}</strong> · {prediction.winningSampleCount} awarded item sample(s) · {prediction.competitorSampleCount} competitor reading(s).</p>
        {prediction.supportingTenders.length > 0 && <details className="prediction-support"><summary>Supporting past tenders ({prediction.supportingTenders.length})</summary>
          {prediction.supportingTenders.map((sample) => <p key={`${sample.tenderId}-${sample.referenceNumber}`}><strong>{sample.referenceNumber}</strong> · {sample.institutionName} · awarded {currency(sample.awardedUnitPrice)} / unit{sample.competitorLowestUnitPrice !== null ? ` · competitor low ${currency(sample.competitorLowestUnitPrice)}` : ""} · {formatDate(sample.closingAt)}</p>)}
        </details>}
        <p className="prediction-disclaimer">{prediction.adjustmentNote} Estimates are advisory, historical, and not a guarantee of winning.</p>
        {prediction.recommendedBidPrice !== null && <button type="button" className="text-button" onClick={() => onUseRecommendation(item.id, prediction.recommendedBidPrice!)}>Use recommendation in quotation</button>}
      </>}
    </div>}
  </article>;
}

type QuotationDraftLine = {
  pricingMethod: "PERCENTAGE" | "DIRECT";
  costBaseMethod: "LOWEST" | "AVERAGE" | "SELECTED";
  supplierPriceId: string;
  marginPercent: string;
  directUnitPrice: string;
  transportCost: string;
  installationCost: string;
  bondCost: string;
  commissionCost: string;
};

function QuotationBuilder({ tender, canViewCosts, onSave, recommendedUnitPrices }: {
  tender: TenderRecord;
  canViewCosts: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  recommendedUnitPrices: Record<string, number>;
}) {
  const [lines, setLines] = useState<QuotationDraftLine[]>(() => tender.items.map(() => ({
    pricingMethod: canViewCosts ? "PERCENTAGE" : "DIRECT",
    costBaseMethod: "LOWEST",
    supplierPriceId: "",
    marginPercent: "15",
    directUnitPrice: "",
    transportCost: "0",
    installationCost: "0",
    bondCost: "0",
    commissionCost: "0",
  })));
  function change(index: number, patch: Partial<QuotationDraftLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSave({
      validityDays: Number(values.get("validityDays")),
      discountAmount: Number(values.get("discountAmount") || 0),
      terms: values.get("terms") || null,
      lines: lines.map((line, index) => ({
        tenderItemId: tender.items[index].id,
        pricingMethod: canViewCosts ? line.pricingMethod : "DIRECT",
        costBaseMethod: canViewCosts ? line.costBaseMethod : "LOWEST",
        supplierPriceId: canViewCosts ? line.supplierPriceId || null : null,
        marginPercent: canViewCosts && line.pricingMethod === "PERCENTAGE" ? Number(line.marginPercent) : null,
        directUnitPrice: line.pricingMethod === "DIRECT" ? Number(line.directUnitPrice) : null,
        transportCost: canViewCosts ? Number(line.transportCost || 0) : 0,
        installationCost: canViewCosts ? Number(line.installationCost || 0) : 0,
        bondCost: canViewCosts ? Number(line.bondCost || 0) : 0,
        commissionCost: canViewCosts ? Number(line.commissionCost || 0) : 0,
      })),
    });
  }
  return <form className="editor-card quotation-builder" onSubmit={submit}>
    <div className="editor-heading"><div><h2>Prepare quotation V{tender.quotations.length + 1}</h2><p>{canViewCosts ? "Supplier prices are saved per item; choose a cost base and set the selling price method." : "Enter customer-facing prices. Supplier costs and margin details are hidden."}</p></div></div>
    {tender.items.map((item, index) => {
      const line = lines[index];
      const available = item.supplierPrices.filter((price) => isSupplierPriceCurrent(price.validUntil));
      const cost = line.costBaseMethod === "AVERAGE"
        ? available.length ? available.reduce((sum, price) => sum + Number(price.unitPrice), 0) / available.length : 0
        : line.costBaseMethod === "SELECTED"
          ? Number(available.find((price) => price.id === line.supplierPriceId)?.unitPrice ?? 0)
          : available.length ? Math.min(...available.map((price) => Number(price.unitPrice))) : 0;
      const extras = Number(line.transportCost) + Number(line.installationCost) + Number(line.bondCost) + Number(line.commissionCost);
      const selling = line.pricingMethod === "PERCENTAGE" ? (cost + extras) * (1 + Number(line.marginPercent || 0) / 100) : Number(line.directUnitPrice || 0);
      return <div className="quote-draft-line" key={item.id}>
        <div className="quote-line-title"><strong>{item.description}</strong><span>{item.quantity} {item.unit}{canViewCosts ? ` · ${available.length} current supplier price(s)` : ""}</span></div>
        <div className="form-grid">
          {canViewCosts && <>
            <label className="field"><span>Pricing method</span><select value={line.pricingMethod} onChange={(event) => change(index, { pricingMethod: event.target.value as QuotationDraftLine["pricingMethod"] })}><option value="PERCENTAGE">Cost + margin</option><option value="DIRECT">Direct selling price</option></select></label>
            <label className="field"><span>Cost base</span><select value={line.costBaseMethod} onChange={(event) => change(index, { costBaseMethod: event.target.value as QuotationDraftLine["costBaseMethod"] })}><option value="LOWEST">Lowest current price</option><option value="AVERAGE">Average current price</option><option value="SELECTED">Select supplier price</option></select></label>
            {line.costBaseMethod === "SELECTED" && <label className="field"><span>Supplier price</span><select required value={line.supplierPriceId} onChange={(event) => change(index, { supplierPriceId: event.target.value })}><option value="">Select a price</option>{available.map((price) => <option key={price.id} value={price.id}>{price.supplierName} · {currency(price.unitPrice)}</option>)}</select></label>}
          </>}
          {line.pricingMethod === "PERCENTAGE" && canViewCosts
            ? <label className="field"><span>Margin %</span><input type="number" min="0" max="1000" step="0.01" required value={line.marginPercent} onChange={(event) => change(index, { marginPercent: event.target.value })} /></label>
            : <label className="field"><span>Direct selling price / unit (LKR)</span><input type="number" min="0" step="0.01" required value={line.directUnitPrice} onChange={(event) => change(index, { directUnitPrice: event.target.value })} /></label>}
          {canViewCosts && <>
            <CostInput label="Transport / unit" value={line.transportCost} onChange={(value) => change(index, { transportCost: value })} />
            <CostInput label="Installation / unit" value={line.installationCost} onChange={(value) => change(index, { installationCost: value })} />
            <CostInput label="Bond cost / unit" value={line.bondCost} onChange={(value) => change(index, { bondCost: value })} />
            <CostInput label="Commission / unit" value={line.commissionCost} onChange={(value) => change(index, { commissionCost: value })} />
          </>}
        </div>
        <div className="quote-line-preview">{canViewCosts ? `Cost base ${currency(cost)} + extras ${currency(extras)} · estimated selling ${currency(selling)} / unit` : `Selling price ${currency(selling)} / unit`}</div>
        {recommendedUnitPrices[item.id] !== undefined && <button type="button" className="text-button apply-recommendation" onClick={() => change(index, {
          pricingMethod: "DIRECT",
          directUnitPrice: String(recommendedUnitPrices[item.id]),
        })}>Model recommendation {currency(recommendedUnitPrices[item.id])} / unit · Apply</button>}
      </div>;
    })}
    <div className="form-grid quote-footer-fields">
      <Field label="Quotation validity (days)" name="validityDays" type="number" required defaultValue={30} />
      <Field label="Discount (LKR)" name="discountAmount" type="number" defaultValue={0} />
      <label className="field field-wide"><span>Terms and conditions</span><textarea name="terms" rows={3} /></label>
    </div>
    <FormActions label="Save quotation draft" />
  </form>;
}

function CostInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

type ReadingBidDraft = {
  companyName: string;
  competitorId: string;
  isOurCompany: boolean;
  totalPrice: string;
  unitPrices: Record<string, string>;
};

function TenderResultsPanel({ tender, results, loading, banks, currentUser, onAction, onCompleteTender, onUploadDocument, onDownloadDocument }: {
  tender: TenderRecord;
  results: TenderResults | null;
  loading: boolean;
  banks: SriLankaBank[];
  currentUser: User;
  onAction: (path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", payload?: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
  onCompleteTender: () => void;
  onUploadDocument: (path: string, file: File, type?: string) => Promise<boolean>;
  onDownloadDocument: (path: string, fileName: string) => void;
}) {
  const [expectedCompetitorId, setExpectedCompetitorId] = useState("");
  const [readingError, setReadingError] = useState("");
  const [awardError, setAwardError] = useState("");
  const [todayInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [readingBids, setReadingBids] = useState<ReadingBidDraft[]>([{
    companyName: "",
    competitorId: "",
    isOurCompany: false,
    totalPrice: "",
    unitPrices: {},
  }]);
  const canComplete = ["ADMIN", "DIRECTOR", "TENDER_MANAGER"].includes(currentUser.role)
    && (currentUser.permissions?.includes("tenders.complete") ?? true);
  if (!results) return <section className="results-panel"><p className="loading-line">{loading ? "Loading tender results…" : "Tender results could not be loaded. Select Open to try again."}</p></section>;
  const companyName = results.companyName;

  function updateReadingBid(index: number, patch: Partial<ReadingBidDraft>) {
    setReadingBids((current) => current.map((bid, bidIndex) => bidIndex === index ? { ...bid, ...patch } : bid));
  }

  async function submitReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const bids = readingBids.map((bid) => ({
      companyName: bid.isOurCompany ? companyName : bid.companyName.trim(),
      competitorId: bid.isOurCompany ? null : bid.competitorId || null,
      isOurCompany: bid.isOurCompany,
      totalPrice: bid.totalPrice ? Number(bid.totalPrice) : null,
      lines: tender.items.flatMap((item) => {
        const unitPrice = bid.unitPrices[item.id];
        return unitPrice ? [{ tenderItemId: item.id, unitPrice: Number(unitPrice) }] : [];
      }),
    }));
    if (bids.some((bid) => !bid.companyName || (bid.totalPrice === null && bid.lines.length === 0))) {
      setReadingError("Each bid needs a company name and a total price or at least one item price.");
      return;
    }
    setReadingError("");
    const saved = await onAction(`/api/tenders/${tender.id}/readings`, "POST", {
      readingDate: formData.get("readingDate"),
      method: formData.get("method"),
      notes: formData.get("notes") || null,
      bids,
    }, "Tender reading recorded.");
    if (!saved) return;
    setReadingBids([{ companyName: "", competitorId: "", isOurCompany: false, totalPrice: "", unitPrices: {} }]);
    form.reset();
  }

  function submitAward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const type = String(formData.get("type")) as "WHOLE" | "ITEM_WISE";
    const lines = tender.items.flatMap((item) => {
      if (type === "ITEM_WISE" && !formData.has(`include-${item.id}`)) return [];
      const winnerField = type === "WHOLE" ? "wholeWinner" : `winner-${item.id}`;
      const winner = String(formData.get(winnerField) ?? "OUR");
      const wonByUs = winner === "OUR";
      const quantity = Number(formData.get(`quantity-${item.id}`));
      const unitPrice = Number(formData.get(`unitPrice-${item.id}`));
      return [{
        tenderItemId: item.id,
        winnerCompetitorId: wonByUs ? null : winner,
        wonByUs,
        quantity,
        unitPrice,
        lossReason: wonByUs ? null : formData.get(`lossReason-${item.id}`),
      }];
    });
    if (!lines.length || lines.some((line) => line.quantity <= 0)) {
      setAwardError("Select at least one awarded item and enter a positive quantity.");
      return;
    }
    setAwardError("");
    onAction(`/api/tenders/${tender.id}/awards`, "POST", {
      type,
      awardedAt: formData.get("awardedAt"),
      reason: formData.get("reason") || null,
      lines,
    }, "Tender award recorded.");
  }

  function submitPurchaseOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const lines = tender.items.flatMap((item) => {
      if (!formData.has(`include-${item.id}`)) return [];
      return [{
        tenderItemId: item.id,
        quantity: Number(formData.get(`quantity-${item.id}`)),
        unitPrice: Number(formData.get(`unitPrice-${item.id}`)),
      }];
    });
    onAction(`/api/tenders/${tender.id}/purchase-orders`, "POST", {
      quotationId: formData.get("quotationId") || null,
      poNumber: formData.get("poNumber"),
      poDate: formData.get("poDate"),
      deliveryDate: formData.get("deliveryDate") || null,
      terms: formData.get("terms") || null,
      paymentTerms: formData.get("paymentTerms") || null,
      documentUrl: formData.get("documentUrl") || null,
      invoiceNumber: formData.get("invoiceNumber") || null,
      lines,
      performanceBondRequired: formData.has("performanceBondRequired"),
      performanceBondAmount: formData.has("performanceBondRequired") ? Number(formData.get("performanceBondAmount")) : null,
      performanceBondBank: formData.get("performanceBondBank") || null,
      performanceBondNumber: formData.get("performanceBondNumber") || null,
      performanceBondExpiryDate: formData.get("performanceBondExpiryDate") || null,
    }, "Purchase order recorded.");
  }

  const orderedQuotations = tender.quotations.filter((quotation) => quotation.status === "APPROVED");
  const canAddReading = ["SUBMITTED", "TENDER_READING_DONE"].includes(tender.status);
  const canEditExpectedBidders = (currentUser.permissions?.includes("readings.manage")
    ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS"].includes(currentUser.role))
    && !["CANCELLED", "COMPLETED"].includes(tender.status);
  const awardedQuantity = (tenderItemId: string) => results.awards.flatMap((award) => award.lines)
    .filter((line) => line.tenderItemId === tenderItemId)
    .reduce((sum, line) => sum + Number(line.quantity), 0);
  const remainingAwardQuantity = (tenderItemId: string) => {
    const item = tender.items.find((candidate) => candidate.id === tenderItemId);
    return Math.max(0, Number(item?.quantity ?? 0) - awardedQuantity(tenderItemId));
  };
  const remainingPoQuantity = (tenderItemId: string) => {
    const awarded = results.awards.flatMap((award) => award.lines)
      .filter((line) => line.tenderItemId === tenderItemId && line.wonByUs)
      .reduce((sum, line) => sum + Number(line.quantity), 0);
    const ordered = results.purchaseOrders.flatMap((order) => order.lines)
      .filter((line) => line.tenderItemId === tenderItemId)
      .reduce((sum, line) => sum + Number(line.quantity), 0);
    return Math.max(0, awarded - ordered);
  };
  const canRecordOrder = ["AWARDED", "PO_RECEIVED"].includes(tender.status)
    && tender.items.some((item) => remainingPoQuantity(item.id) > 0);
  const canRecordAward = ["SUBMITTED", "TENDER_READING_DONE", "AWARDED", "LOST", "PO_RECEIVED"].includes(tender.status)
    && tender.items.some((item) => remainingAwardQuantity(item.id) > 0);
  const canFinishTender = tender.items.every((item) =>
    remainingAwardQuantity(item.id) <= 1e-8 && remainingPoQuantity(item.id) <= 1e-8);
  return <section className="results-panel">
    <div className="results-heading"><div><p className="eyebrow">TENDER RESULTS</p><h3>Readings, awards &amp; purchase orders</h3></div><StatusBadge status={tender.status} /></div>

    {results.expectedBidders.length > 0 && <div className="results-subsection">
      <h4>Expected bidders</h4>
      <div className="expected-bidders">{results.expectedBidders.map(({ competitor }) => <span className="expected-bidder" key={competitor.id}>
        {competitor.name}
        {canEditExpectedBidders && <button type="button" className="text-button" aria-label={`Remove ${competitor.name} from expected bidders`} onClick={() => onAction(`/api/tenders/${tender.id}/expected-bidders/${competitor.id}`, "DELETE", undefined, "Expected bidder removed.")}>Remove</button>}
      </span>)}</div>
    </div>}
    {canEditExpectedBidders && <form className="expected-bidder-form" onSubmit={(event) => {
      event.preventDefault();
      if (!expectedCompetitorId) return;
      onAction(`/api/tenders/${tender.id}/expected-bidders`, "POST", { competitorId: expectedCompetitorId }, "Expected bidder added.");
      setExpectedCompetitorId("");
    }}>
      <label className="field"><span>Add expected bidder</span><select value={expectedCompetitorId} onChange={(event) => setExpectedCompetitorId(event.target.value)} required>
        <option value="">Select a competitor</option>
        {results.competitors.filter((competitor) => !results.expectedBidders.some((bidder) => bidder.competitor.id === competitor.id)).map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
      </select></label>
      <button className="secondary-button" disabled={!expectedCompetitorId}>Add bidder</button>
    </form>}

    {canAddReading && <form className="results-form" onSubmit={submitReading}>
      <h4>Record tender reading</h4>
      {readingError && <p className="feedback error-feedback">{readingError}</p>}
      <div className="form-grid">
        <Field label="Reading date" name="readingDate" type="date" required defaultValue={todayInput} />
        <label className="field"><span>Reading method</span><select name="method" defaultValue="CALL"><option value="CALL">Telephone call</option><option value="VISIT">Visit</option></select></label>
        <label className="field field-wide"><span>Notes</span><textarea name="notes" rows={2} /></label>
      </div>
      {readingBids.map((bid, index) => <div className="reading-bid-draft" key={index}>
        <div className="results-subheading"><strong>Bid {index + 1}</strong>{readingBids.length > 1 && <button type="button" className="text-button" onClick={() => setReadingBids((current) => current.filter((_, bidIndex) => bidIndex !== index))}>Remove bid</button>}</div>
        <label className="field reading-own-company"><input type="checkbox" checked={bid.isOurCompany} onChange={(event) => updateReadingBid(index, {
          isOurCompany: event.target.checked,
          companyName: event.target.checked ? results.companyName : "",
          competitorId: "",
        })} /><span>Our company bid</span></label>
        {!bid.isOurCompany && <div className="form-grid">
          <label className="field"><span>Select known competitor</span><select value={bid.competitorId} onChange={(event) => {
            const competitor = results.competitors.find((candidate) => candidate.id === event.target.value);
            updateReadingBid(index, { competitorId: event.target.value, companyName: competitor?.name ?? bid.companyName });
          }}><option value="">Enter a new company below</option>{results.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select></label>
          <label className="field"><span>Company name</span><input required value={bid.companyName} onChange={(event) => updateReadingBid(index, { companyName: event.target.value, competitorId: "" })} /></label>
        </div>}
        <p className="field-hint">Enter the competitor's total bid and/or its unit price for each tender item. Item prices are compared separately below.</p>
        <label className="field"><span>Total bid price (LKR)</span><input type="number" min="0" step="0.01" value={bid.totalPrice} onChange={(event) => updateReadingBid(index, { totalPrice: event.target.value })} /></label>
        {tender.items.length > 0 && <div className="results-item-grid">{tender.items.map((item) => <label className="field" key={item.id}><span>{item.description} · {item.quantity} {item.unit} · unit price (LKR)</span><input type="number" min="0" step="0.01" value={bid.unitPrices[item.id] ?? ""} onChange={(event) => updateReadingBid(index, { unitPrices: { ...bid.unitPrices, [item.id]: event.target.value } })} /></label>)}</div>}
      </div>)}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setReadingBids((current) => [...current, { companyName: "", competitorId: "", isOurCompany: false, totalPrice: "", unitPrices: {} }])}>Add bid</button><button className="primary-button">Save reading</button></div>
    </form>}

    <div className="results-subsection">
      <h4>Reading history &amp; bid rankings</h4>
      {results.readings.length === 0 ? <p className="results-empty">No readings recorded yet.</p> : results.readings.map((reading) => {
        const rankedBids = reading.bids.map((bid) => {
          const lineTotal = bid.lines.reduce((sum, line) => sum + Number(line.unitPrice) * Number(tender.items.find((item) => item.id === line.tenderItemId)?.quantity ?? 1), 0);
          const comparablePrice = bid.totalPrice === null
            ? bid.lines.length === tender.items.length ? lineTotal : null
            : Number(bid.totalPrice);
          return { bid, comparablePrice };
        }).sort((a, b) => (a.comparablePrice ?? Number.POSITIVE_INFINITY) - (b.comparablePrice ?? Number.POSITIVE_INFINITY));
        const comparableBids = rankedBids.filter((entry) => entry.comparablePrice !== null);
        const lowest = comparableBids[0]?.comparablePrice ?? 0;
        const ourPosition = comparableBids.findIndex(({ bid }) => bid.isOurCompany);
        return <article className="reading-card" key={reading.id}>
          <div className="reading-heading"><div><strong>{reading.method === "CALL" ? "Telephone call" : "Visit"} · {formatDate(reading.readingDate)}</strong><span>Reported by {reading.reportedBy.fullName}{reading.notes ? ` · ${reading.notes}` : ""}</span></div></div>
          {ourPosition >= 0 && <p className="our-position">Our position: <strong>#{ourPosition + 1}</strong> · {currency(comparableBids[ourPosition].comparablePrice! - lowest)} above the lowest bid</p>}
          <div className="itemwise-comparison">
            <div className="results-subheading"><h4>Item-wise bid price comparison</h4><span>Unit prices in LKR · lowest recorded price highlighted</span></div>
            <div className="table-card"><table className="itemwise-comparison-table"><thead><tr>
              <th>REQUESTED ITEM</th><th>QUANTITY</th>
              {reading.bids.map((bid) => <th key={bid.id}>{bid.companyName}{bid.isOurCompany && <small className="sub-cell">Our company</small>}</th>)}
            </tr></thead><tbody>
              {tender.items.map((item) => {
                const itemPrices = reading.bids.flatMap((bid) => {
                  const line = bid.lines.find((entry) => entry.tenderItemId === item.id);
                  return line ? [{ bidId: bid.id, price: Number(line.unitPrice) }] : [];
                });
                const lowestItemPrice = itemPrices.length ? Math.min(...itemPrices.map((entry) => entry.price)) : null;
                return <tr key={item.id}>
                  <td><strong>{item.description}</strong><small className="sub-cell">{item.specification || item.item?.code || "Tender item"}</small></td>
                  <td>{item.quantity} {item.unit}</td>
                  {reading.bids.map((bid) => {
                    const line = bid.lines.find((entry) => entry.tenderItemId === item.id);
                    const isLowest = line !== undefined && Number(line.unitPrice) === lowestItemPrice;
                    return <td key={bid.id} className={isLowest ? "item-price-lowest" : undefined}>
                      {line ? currency(line.unitPrice) : <span className="item-price-missing">Not provided</span>}
                      {isLowest && <small className="item-price-lowest-label">Lowest</small>}
                    </td>;
                  })}
                </tr>;
              })}
            </tbody></table></div>
            <p className="itemwise-comparison-note">"Not provided" means no unit price was recorded for that company's item. Total-only bids cannot be split into item prices.</p>
          </div>
          <div className="table-card"><table className="results-table"><thead><tr><th>RANK</th><th>BIDDER</th><th>COMPARABLE TOTAL</th><th>GAP TO LOWEST</th><th>ITEM PRICES / HISTORY</th></tr></thead><tbody>
            {rankedBids.map(({ bid, comparablePrice }) => <tr key={bid.id}>
              <td>{comparablePrice === null ? "—" : `#${comparableBids.findIndex((entry) => entry.bid.id === bid.id) + 1}`}</td><td><strong>{bid.companyName}</strong>{bid.isOurCompany && <small className="sub-cell">Our company</small>}</td><td>{comparablePrice === null ? "Not comparable — enter all item prices or a total" : currency(comparablePrice)}{bid.totalPrice === null && comparablePrice !== null && <small className="sub-cell">Calculated from full item prices</small>}</td><td>{comparablePrice === null ? "—" : currency(comparablePrice - lowest)}</td>
              <td><details><summary>View / correct bid ({bid.lines.length} item prices, {bid.history.length} edits)</summary>
                {bid.lines.map((line) => <p className="history-line" key={line.id}>{line.tenderItem.description}: {currency(line.unitPrice)} / {line.tenderItem.unit}</p>)}
                <form className="bid-correction-form" onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  const companyName = String(formData.get("companyName") || "").trim();
                  const isOurCompany = formData.get("isOurCompany") === "true";
                  onAction(`/api/reading-bids/${bid.id}`, "PUT", {
                    companyName: isOurCompany ? results.companyName : companyName,
                    competitorId: isOurCompany ? null : formData.get("competitorId") || null,
                    isOurCompany,
                    totalPrice: formData.get("totalPrice") ? Number(formData.get("totalPrice")) : null,
                    lines: tender.items.flatMap((item) => {
                      const unitPrice = formData.get(`unitPrice-${item.id}`);
                      return unitPrice ? [{ tenderItemId: item.id, unitPrice: Number(unitPrice) }] : [];
                    }),
                  }, "Bid correction saved.");
                }}>
                  <input type="hidden" name="isOurCompany" value={String(bid.isOurCompany)} />
                  {bid.isOurCompany && <p className="field-hint">This bid belongs to {results.companyName}.</p>}
                  <label className="field"><span>Company name</span><input name="companyName" defaultValue={bid.isOurCompany ? results.companyName : bid.companyName} required readOnly={bid.isOurCompany} /></label>
                  {!bid.isOurCompany && <label className="field"><span>Known competitor</span><select name="competitorId" defaultValue={bid.competitor?.id ?? ""}><option value="">New / unlinked company</option>{results.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select></label>}
                  <label className="field"><span>Total bid price (LKR)</span><input name="totalPrice" type="number" min="0" step="0.01" defaultValue={bid.totalPrice ?? ""} /></label>
                  {tender.items.map((item) => <label className="field" key={item.id}><span>{item.description} · {item.quantity} {item.unit} · unit price (LKR)</span><input name={`unitPrice-${item.id}`} type="number" min="0" step="0.01" defaultValue={bid.lines.find((line) => line.tenderItemId === item.id)?.unitPrice ?? ""} /></label>)}
                  {bid.history.map((entry) => <div key={entry.id} className="history-entry">
                    <p className="history-line">Edited {formatDate(entry.changedAt)} by {entry.editedBy.fullName}: {entry.previousData.companyName || "Previous bid"} · total {entry.previousData.totalPrice !== null && entry.previousData.totalPrice !== undefined ? currency(entry.previousData.totalPrice) : "not entered"}</p>
                    {(Array.isArray(entry.previousData.lines) ? entry.previousData.lines : []).map((line) => <p className="history-line" key={line.tenderItemId}>Previous item price: {tender.items.find((item) => item.id === line.tenderItemId)?.description ?? "Tender item"} · {currency(line.unitPrice)} / unit</p>)}
                  </div>)}
                  <button className="secondary-button">Save correction</button>
                </form>
              </details></td>
            </tr>)}
          </tbody></table></div>
        </article>;
      })}
    </div>

    {canRecordAward && <form className="results-form" onSubmit={submitAward}>
      <h4>Record award or loss</h4>
      {awardError && <p className="feedback error-feedback">{awardError}</p>}
      <div className="form-grid">
        <label className="field"><span>Award type</span><select name="type" defaultValue={results.awards.length ? "ITEM_WISE" : "WHOLE"}><option value="WHOLE" disabled={results.awards.length > 0}>Whole tender</option><option value="ITEM_WISE">Item-wise</option></select></label>
        <Field label="Award date" name="awardedAt" type="date" required defaultValue={todayInput} />
        <label className="field"><span>Whole-tender winner</span><select name="wholeWinner" defaultValue="OUR"><option value="OUR">{results.companyName}</option>{results.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select></label>
        <label className="field field-wide"><span>Notes / loss summary</span><textarea name="reason" rows={2} /></label>
      </div>
      {tender.items.map((item) => {
        const remaining = remainingAwardQuantity(item.id);
        return <div className="award-item-row" key={item.id}>
        <label className="award-item-name"><input type="checkbox" name={`include-${item.id}`} defaultChecked={remaining > 0} disabled={remaining <= 0} /><span><strong>{item.description}</strong><small>{remaining} {item.unit} remaining awardable</small></span></label>
        <label className="field"><span>Item-wise winner</span><select name={`winner-${item.id}`} defaultValue="OUR"><option value="OUR">{results.companyName}</option>{results.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select></label>
        <label className="field"><span>Quantity ({item.unit})</span><input name={`quantity-${item.id}`} type="number" min="0" max={remaining} step="0.01" defaultValue={remaining} disabled={remaining <= 0} /></label>
        <Field label="Unit price (LKR)" name={`unitPrice-${item.id}`} type="number" defaultValue={item.estimatedUnitPrice ?? 0} />
        <label className="field"><span>Loss reason if not won</span><select name={`lossReason-${item.id}`} defaultValue="PRICE"><option value="PRICE">Price</option><option value="SPECIFICATION">Specification</option><option value="DELIVERY">Delivery</option><option value="BOND">Bond</option><option value="DISQUALIFICATION">Disqualification</option><option value="OTHER">Other</option></select></label>
        </div>;
      })}
      <FormActions label="Save award" />
    </form>}

    {results.awards.length > 0 && <div className="results-subsection"><h4>Awards recorded</h4>{results.awards.map((award) => <article className="reading-card" key={award.id}>
      <div className="reading-heading"><strong>{award.type === "WHOLE" ? "Whole-tender award" : "Item-wise award"} · {formatDate(award.awardedAt)}</strong><span>{award.reason}</span></div>
      {award.lines.map((line) => <p className="history-line" key={line.id}>{line.tenderItem.description}: {line.winnerName} · {line.quantity} {line.tenderItem.unit} at {currency(line.unitPrice)}{line.lossReason ? ` · ${line.lossReason.replaceAll("_", " ")}` : ""}</p>)}
    </article>)}</div>}

    {canRecordOrder && <form className="results-form" onSubmit={submitPurchaseOrder}>
      <h4>Record purchase order</h4>
      <div className="form-grid">
        <Field label="PO number" name="poNumber" required />
        <Field label="PO date" name="poDate" type="date" required defaultValue={todayInput} />
        <Field label="Expected delivery date" name="deliveryDate" type="date" />
        <label className="field"><span>Approved quotation</span><select name="quotationId" defaultValue=""><option value="">Not linked</option>{orderedQuotations.map((quotation) => <option key={quotation.id} value={quotation.id}>Version {quotation.version} · {currency(quotation.totalAmount)}</option>)}</select></label>
        <Field label="Invoice number" name="invoiceNumber" />
        <Field label="Document URL" name="documentUrl" type="url" />
        <label className="field"><span>Terms</span><textarea name="terms" rows={2} /></label>
        <label className="field"><span>Payment terms</span><textarea name="paymentTerms" rows={2} /></label>
      </div>
      <h5>Order lines (select remaining awarded quantities)</h5>
      {tender.items.map((item) => {
        const remaining = remainingPoQuantity(item.id);
        const ourAward = results.awards.flatMap((award) => award.lines).find((line) => line.tenderItemId === item.id && line.wonByUs);
        return <div className="award-item-row" key={item.id}>
        <label className="award-item-name"><input type="checkbox" name={`include-${item.id}`} defaultChecked={remaining > 0} disabled={remaining <= 0} /><span><strong>{item.description}</strong><small>{remaining} {item.unit} remaining awarded</small></span></label>
        <label className="field"><span>Quantity ({item.unit})</span><input name={`quantity-${item.id}`} type="number" min="0" max={remaining} step="0.01" defaultValue={remaining} disabled={remaining <= 0} /></label>
        <label className="field"><span>Unit price (LKR)</span><input name={`unitPrice-${item.id}`} type="number" min="0" step="0.01" defaultValue={ourAward?.unitPrice ?? item.estimatedUnitPrice ?? 0} disabled={remaining <= 0} /></label>
        </div>;
      })}
      <label className="field reading-own-company"><input type="checkbox" name="performanceBondRequired" /><span>Performance bond required</span></label>
      <div className="form-grid">
        <Field label="Performance bond amount" name="performanceBondAmount" type="number" />
        <label className="field"><span>Bond bank</span><select name="performanceBondBank" defaultValue=""><option value="">Select bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name} · {bank.code}</option>)}</select></label>
        <Field label="Bond number" name="performanceBondNumber" />
        <Field label="Bond expiry date" name="performanceBondExpiryDate" type="date" />
      </div>
      <FormActions label="Save purchase order" />
    </form>}

    {results.purchaseOrders.length > 0 && <div className="results-subsection"><h4>Purchase orders &amp; performance bonds</h4>{results.purchaseOrders.map((order) => <PurchaseOrderCard key={order.id} order={order} banks={banks} onAction={onAction} canManageDocuments={currentUser.permissions?.includes("purchaseOrders.manage") ?? true} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />)}</div>}
    {canComplete && tender.status === "PO_RECEIVED" && <div className="form-actions">
      {!canFinishTender && <p className="field-hint">Record award or loss outcomes for every requested quantity and purchase orders for all quantities won by your company before completing.</p>}
      <button type="button" className="primary-button" onClick={onCompleteTender} disabled={!canFinishTender}>Complete tender</button>
    </div>}
  </section>;
}

function PurchaseOrderCard({ order, banks, onAction, canManageDocuments, onUploadDocument, onDownloadDocument }: {
  order: PurchaseOrder;
  banks: SriLankaBank[];
  onAction: (path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", payload?: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
  canManageDocuments: boolean;
  onUploadDocument: (path: string, file: File, type?: string) => Promise<boolean>;
  onDownloadDocument: (path: string, fileName: string) => void;
}) {
  function updateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onAction(`/api/purchase-orders/${order.id}`, "PATCH", {
      deliveryStatus: formData.get("deliveryStatus"),
      invoiceNumber: formData.get("invoiceNumber") || null,
      paymentReceived: formData.has("paymentReceived"),
      performanceBondStatus: formData.get("performanceBondStatus"),
    }, "Purchase order updated.");
  }
  return <article className="reading-card purchase-order-card">
    <div className="reading-heading"><div><strong>{order.poNumber} · {formatDate(order.poDate)}</strong><span>{order.quotation ? `Quotation V${order.quotation.version}` : "No quotation linked"}{order.deliveryDate ? ` · Delivery ${formatDate(order.deliveryDate)}` : ""}</span></div><StatusBadge status={order.deliveryStatus} /></div>
    {order.lines.map((line) => <p className="history-line" key={line.id}>{line.tenderItem.description}: {line.quantity} {line.tenderItem.unit} at {currency(line.unitPrice)}</p>)}
    <p className="history-line">{order.performanceBondRequired ? `Bond ${order.performanceBondNumber || "number not entered"} · ${bankLabel(order.performanceBondBank, banks)} · ${order.performanceBondAmount ? currency(order.performanceBondAmount) : "amount not entered"}` : "No performance bond required"}</p>
    <form className="form-grid po-update-form" onSubmit={updateOrder}>
      <label className="field"><span>Delivery status</span><select name="deliveryStatus" defaultValue={order.deliveryStatus}><option value="PENDING">Pending</option><option value="PARTIAL">Partial</option><option value="DELIVERED">Delivered</option></select></label>
      <Field label="Invoice number" name="invoiceNumber" defaultValue={order.invoiceNumber ?? ""} />
      <label className="field"><span>Performance bond status</span><select name="performanceBondStatus" defaultValue={order.performanceBondStatus}>
        {!order.performanceBondRequired && <option value="NOT_REQUIRED">Not required</option>}
        {order.performanceBondRequired && <><option value="REQUESTED">Requested</option><option value="ISSUED">Issued</option><option value="SUBMITTED">Submitted</option><option value="RETURNED">Returned</option><option value="EXPIRED">Expired</option></>}
      </select></label>
      <label className="field reading-own-company"><input type="checkbox" name="paymentReceived" defaultChecked={order.paymentReceived} /><span>Payment received</span></label>
      <div className="form-actions"><button className="secondary-button">Update order</button></div>
    </form>
    <DocumentAttachments
      title="Purchase order documents"
      documents={order.documents}
      basePath={`/api/purchase-orders/${order.id}/documents`}
      canManage={canManageDocuments}
      onUpload={onUploadDocument}
      onDownload={onDownloadDocument}
      onDelete={(path, message) => onAction(path, "DELETE", undefined, message)}
    />
  </article>;
}

function TenderDetailsPanel({ tender, results, resultsLoading, suppliers, banks, currentUser, onClose, onAddPrice, onCreateQuotation, onQuotationAction, onSubmitTender, onResultAction, onCompleteTender, onEditSupplierPrice, onPredictPrice, onUploadDocument, onDownloadDocument }: {
  tender: TenderRecord;
  results: TenderResults | null;
  resultsLoading: boolean;
  suppliers: Supplier[];
  banks: SriLankaBank[];
  currentUser: User;
  onClose: () => void;
  onAddPrice: (itemId: string, payload: Record<string, unknown>) => Promise<boolean>;
  onCreateQuotation: (payload: Record<string, unknown>) => void;
  onQuotationAction: (quotationId: string, action: "submit" | "approve" | "reject") => void;
  onSubmitTender: () => void;
  onResultAction: (path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", payload?: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
  onCompleteTender: () => void;
  onEditSupplierPrice: (price: SupplierPrice) => void;
  onPredictPrice: (tenderId: string, itemId: string, payload: Record<string, unknown>) => Promise<PricePrediction>;
  onUploadDocument: (path: string, file: File, type?: string) => Promise<boolean>;
  onDownloadDocument: (path: string, fileName: string) => void;
}) {
  const [addingSupplierPrice, setAddingSupplierPrice] = useState(false);
  const [priceRecommendations, setPriceRecommendations] = useState<Record<string, number>>({});
  const [editingBidBondDetails, setEditingBidBondDetails] = useState(false);
  const [savingBidBondDetails, setSavingBidBondDetails] = useState(false);
  const latest = tender.quotations[0];
  const canPrepareQuotation = currentUser.permissions?.includes("quotations.prepare")
    ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP"].includes(currentUser.role);
  const canSubmitTender = currentUser.permissions?.includes("tenders.submit")
    ?? ["ADMIN", "TENDER_MANAGER", "SALES_REP"].includes(currentUser.role);
  const canApproveManager = currentUser.role === "ADMIN"
    || currentUser.role === "TENDER_MANAGER" && (currentUser.permissions?.includes("quotations.approve") ?? true);
  const canApproveDirector = currentUser.role === "ADMIN"
    || currentUser.role === "DIRECTOR" && (currentUser.permissions?.includes("quotations.approve") ?? true);
  const canViewCosts = currentUser.permissions?.includes("pricingCosts.view") ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "COSTING"].includes(currentUser.role);
  const canAddSupplierPrice = currentUser.permissions?.includes("supplierPrices.manage") ?? ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "COSTING"].includes(currentUser.role);
  const canManageBidBond = currentUser.permissions?.includes("tenders.create") ?? ["ADMIN", "TENDER_MANAGER", "SALES_REP"].includes(currentUser.role);
  const canViewResults = currentUser.permissions?.includes("readings.view") ?? true;
  const nextStep = getTenderNextStep(tender, results, currentUser);
  return <section className="tender-details-panel">
    <div className="tender-details-heading"><div><p className="eyebrow">TENDER DETAILS</p><h2>{formatTenderNumber(tender.tenderNumber)} · {tender.referenceNumber} · {tender.institution.name}</h2><span>{tender.type.replace("_", " ")} · Closing {formatDate(tender.closingAt)} · Rep {tender.responsibleRep.fullName}</span></div><div className="tender-details-actions">{canAddSupplierPrice && <button type="button" className="primary-button" onClick={() => setAddingSupplierPrice(true)}>＋ Add supplier price</button>}<button type="button" className="icon-button" onClick={onClose} aria-label="Close tender details"><X size={18} /></button></div></div>
    <div className={`tender-next-step tender-next-step-${nextStep.tone}`} role={nextStep.tone === "red" ? "alert" : "status"}>
      <strong>{nextStep.title}</strong>
      <p>{nextStep.message}</p>
    </div>
    {tender.registrationWarning && <div className="feedback error-feedback">Supplier registration is not valid through this tender's closing date.</div>}
    {tender.bidBondRequired && <>
      <div className="bond-summary"><strong>Bid bond</strong><span>{tender.bidBondAmount ? currency(tender.bidBondAmount) : "Amount not entered"}</span><span>{bankLabel(tender.bidBondBank, banks)}</span><span>{tender.bidBondNumber || "Bond number not entered"}</span><StatusBadge status={tender.bidBondStatus ?? "REQUESTED"} />{canManageBidBond && <button type="button" className="secondary-button" onClick={() => setEditingBidBondDetails((editing) => !editing)}>{editingBidBondDetails ? "Cancel details edit" : "Edit bond details"}</button>}</div>
      {editingBidBondDetails && canManageBidBond && <form className="form-grid bond-details-editor" onSubmit={async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const amount = String(values.get("bidBondAmount") ?? "").trim();
        setSavingBidBondDetails(true);
        try {
          const saved = await onResultAction(`/api/tenders/${tender.id}/bid-bond`, "PATCH", {
            bidBondAmount: amount ? Number(amount) : null,
            bidBondBank: values.get("bidBondBank") || null,
            bidBondNumber: values.get("bidBondNumber") || null,
            bidBondIssueDate: values.get("bidBondIssueDate") || null,
            bidBondExpiryDate: values.get("bidBondExpiryDate") || null,
            bidBondStatus: values.get("bidBondStatus"),
          }, "Bid bond details and status updated.");
          if (saved) setEditingBidBondDetails(false);
        } finally {
          setSavingBidBondDetails(false);
        }
      }}>
        <label className="field"><span>Bond amount (LKR)</span><input name="bidBondAmount" type="number" min="0" step="0.01" defaultValue={tender.bidBondAmount ?? ""} /></label>
        <label className="field"><span>Bond bank</span><select name="bidBondBank" defaultValue={tender.bidBondBank ?? ""}><option value="">Select bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name} · {bank.code}</option>)}</select></label>
        <label className="field"><span>Bond number</span><input name="bidBondNumber" maxLength={100} defaultValue={tender.bidBondNumber ?? ""} /></label>
        <label className="field"><span>Issue date</span><input name="bidBondIssueDate" type="date" defaultValue={tender.bidBondIssueDate?.slice(0, 10) ?? ""} /></label>
        <label className="field"><span>Expiry date</span><input name="bidBondExpiryDate" type="date" defaultValue={tender.bidBondExpiryDate?.slice(0, 10) ?? ""} /></label>
        <label className="field"><span>Bond status</span><select name="bidBondStatus" defaultValue={tender.bidBondStatus ?? "REQUESTED"}>
          <option value="REQUESTED">Requested</option>
          <option value="ISSUED">Issued</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="RETURNED">Returned</option>
          <option value="EXPIRED">Expired</option>
        </select></label>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditingBidBondDetails(false)} disabled={savingBidBondDetails}>Cancel</button><button type="submit" className="primary-button" disabled={savingBidBondDetails}>{savingBidBondDetails ? "Saving…" : "Save bond details"}<span>→</span></button></div>
      </form>}
    </>}
    <DocumentAttachments
      title="Tender documents & addenda"
      documents={tender.documents}
      basePath={`/api/tenders/${tender.id}/documents`}
      canManage={currentUser.permissions?.includes("tenders.create") ?? true}
      typeOptions={[
        { value: "TENDER_DOCUMENT", label: "Tender document" },
        { value: "ADDENDUM", label: "Addendum" },
        { value: "OTHER", label: "Other" },
      ]}
      onUpload={onUploadDocument}
      onDownload={onDownloadDocument}
      onDelete={(path, message) => onResultAction(path, "DELETE", undefined, message)}
    />
    <div className="table-card"><table><thead><tr><th>REQUESTED ITEM</th><th>QUANTITY</th><th>ESTIMATE / UNIT</th><th>SUPPLIER PRICES</th></tr></thead><tbody>{tender.items.map((item) => <tr key={item.id}>
      <td><strong>{item.description}</strong><small className="sub-cell">{item.specification || item.item?.code || "Custom tender line"}</small></td><td>{item.quantity} {item.unit}</td><td>{item.estimatedUnitPrice ? currency(item.estimatedUnitPrice) : "—"}</td>
      <td>{!canViewCosts ? "Restricted" : item.supplierPrices.length ? <div className="supplier-price-list">{item.supplierPrices.map((price, index) => <span key={price.id} className={index === 0 ? "lowest-price" : ""}><strong>{price.supplierName}</strong> {currency(price.unitPrice)}{index === 0 ? " · Lowest" : ""}<small> by {price.requestedBy.fullName}{price.validUntil ? ` · valid through ${formatDate(price.validUntil)}` : ""}</small>{canAddSupplierPrice && <button type="button" className="text-button supplier-price-edit" onClick={() => onEditSupplierPrice(price)}>Edit price</button>}</span>)}</div> : "No prices yet"}</td>
    </tr>)}</tbody></table></div>
    {addingSupplierPrice && <Modal title="Add supplier item price" onClose={() => setAddingSupplierPrice(false)}>
      <SupplierPriceCreateForm
        items={tender.items}
        suppliers={suppliers}
        onSave={onAddPrice}
        onCancel={() => setAddingSupplierPrice(false)}
      />
    </Modal>}
    {canAddSupplierPrice && ["NEW", "PRICE_REQUESTED", "QUOTED"].includes(tender.status) && <PricePredictionPanel
      tender={tender}
      onPredict={onPredictPrice}
      onUseRecommendation={(itemId, price) => setPriceRecommendations((current) => ({ ...current, [itemId]: price }))}
    />}
    {canViewResults ? <TenderResultsPanel
      tender={tender}
      results={results}
      loading={resultsLoading}
      banks={banks}
      currentUser={currentUser}
      onAction={onResultAction}
      onCompleteTender={onCompleteTender}
      onUploadDocument={onUploadDocument}
      onDownloadDocument={onDownloadDocument}
    /> : <EmptyState icon={<FileText size={20} />} title="Tender results restricted" message="Your role can view tender details but does not have permission to view readings, awards, or purchase orders." />}
    {tender.quotations.map((quotation) => <article className="quotation-version-card" key={quotation.id}>
      <div className="quotation-version-heading"><div><h3>Quotation V{quotation.version}</h3><span>Created by {quotation.createdBy.fullName} · {formatDate(quotation.createdAt)}</span></div><StatusBadge status={quotation.status} /></div>
      <div className="quotation-total-row"><span>Subtotal {currency(quotation.subtotal)}</span><span>VAT {currency(quotation.vatAmount)}</span><strong>Total {currency(quotation.totalAmount)}</strong></div>
      {quotation.rejectionReason && <p className="rejection-reason">Rejected: {quotation.rejectionReason}</p>}
      <div className="quotation-actions">
        {quotation.status === "DRAFT" && quotation.createdById === currentUser.id && canPrepareQuotation && <button className="secondary-button" onClick={() => onQuotationAction(quotation.id, "submit")}>Submit for approval</button>}
        {quotation.status === "PENDING_TENDER_MANAGER" && canApproveManager && <>{(currentUser.role === "ADMIN" || quotation.createdById !== currentUser.id) && <button className="secondary-button" onClick={() => onQuotationAction(quotation.id, "approve")}>Approve · Manager</button>}<button className="text-button" onClick={() => onQuotationAction(quotation.id, "reject")}>Reject</button></>}
        {quotation.status === "PENDING_DIRECTOR" && canApproveDirector && <>{(currentUser.role === "ADMIN" || quotation.createdById !== currentUser.id) && <button className="primary-button" onClick={() => onQuotationAction(quotation.id, "approve")}>Approve · Director</button>}<button className="text-button" onClick={() => onQuotationAction(quotation.id, "reject")}>Reject</button></>}
        {quotation.status === "APPROVED" && <button className="secondary-button" onClick={() => window.print()}>Print customer quotation</button>}
      </div>
      {quotation.managerApprovedBy && <p className="approval-note">Manager approval: {quotation.managerApprovedBy.fullName}</p>}
      {quotation.directorApprovedBy && <p className="approval-note">Director approval: {quotation.directorApprovedBy.fullName}</p>}
    </article>)}
    {latest?.status === "APPROVED" && ["NEW", "PRICE_REQUESTED", "QUOTED"].includes(tender.status) && canSubmitTender && <div className="form-actions"><button className="primary-button" onClick={onSubmitTender}>Mark tender as submitted</button></div>}
    {["NEW", "PRICE_REQUESTED", "QUOTED"].includes(tender.status) && tender.items.every((item) => item.hasCurrentSupplierPrice || item.supplierPrices.some((price) => isSupplierPriceCurrent(price.validUntil))) && currentUser.permissions?.includes("quotations.prepare") && <QuotationBuilder key={`${tender.id}-${tender.quotations.length}`} tender={tender} canViewCosts={canViewCosts} onSave={onCreateQuotation} recommendedUnitPrices={priceRecommendations} />}
    {["NEW", "PRICE_REQUESTED", "QUOTED"].includes(tender.status) && tender.items.some((item) => !item.hasCurrentSupplierPrice && !item.supplierPrices.some((price) => isSupplierPriceCurrent(price.validUntil))) && <EmptyState icon={<FileText size={20} />} title="Supplier prices needed" message="A current supplier price is required before preparing a quotation." />}
    <div className="quote-print-document">
      {latest?.status === "APPROVED" && <QuotationPrint tender={tender} quotation={latest} />}
    </div>
  </section>;
}

function SupplierPriceCreateForm({ items, suppliers, onSave, onCancel }: {
  items: TenderLine[];
  suppliers: Supplier[];
  onSave: (itemId: string, payload: Record<string, unknown>) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [receivedDateDefault] = useState(() => new Date().toISOString().slice(0, 10));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setFormError("");
    try {
      const saved = await onSave(String(values.get("tenderItemId")), {
        supplierId: values.get("supplierId"),
        unitPrice: Number(values.get("unitPrice")),
        givenBy: values.get("givenBy") || null,
        receivedAt: values.get("receivedAt") ? new Date(String(values.get("receivedAt"))).toISOString() : new Date().toISOString(),
        validUntil: values.get("validUntil") || null,
        notes: values.get("notes") || null,
      });
      if (saved) onCancel();
      else setFormError("The price could not be saved. Check the error message on the page and try again.");
    } finally {
      setSaving(false);
    }
  }
  return <form className="editor-card modal-form" onSubmit={(event) => void submit(event)}>
    <div className="editor-heading"><div><h2>Add supplier item price</h2><p>Select the tender item and supplier, then enter their quoted unit price.</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Close form"><X size={18} /></button></div>
    {formError && <p className="feedback error-feedback" role="alert">{formError}</p>}
    <div className="form-grid">
      <label className="field"><span>Tender item <i>*</i></span><select name="tenderItemId" required defaultValue=""><option value="" disabled>Select an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.description} · {item.quantity} {item.unit}</option>)}</select></label>
      <label className="field"><span>Supplier <i>*</i></span><select name="supplierId" required defaultValue=""><option value="" disabled>{suppliers.length ? "Select a supplier" : "No active suppliers available"}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <label className="field"><span>Unit price (LKR) <i>*</i></span><input name="unitPrice" type="number" min="0" step="0.01" required /></label>
      <Field label="Supplier contact" name="givenBy" />
      <Field label="Price received date" name="receivedAt" type="date" defaultValue={receivedDateDefault} />
      <Field label="Price valid until" name="validUntil" type="date" />
      <label className="field field-wide"><span>Notes</span><textarea name="notes" rows={3} maxLength={2000} /></label>
    </div>
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>Cancel</button><button className="primary-button" disabled={saving || !items.length || !suppliers.length}>{saving ? "Saving…" : "Save supplier price"}<span>→</span></button></div>
  </form>;
}

function SupplierPriceEditForm({ price, onSave, onCancel }: {
  price: SupplierPrice;
  onSave: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSave({
      unitPrice: Number(formData.get("unitPrice")),
      givenBy: formData.get("givenBy") || null,
      receivedAt: formData.get("receivedAt") ? new Date(String(formData.get("receivedAt"))).toISOString() : price.receivedAt,
      validUntil: formData.get("validUntil") || null,
      notes: formData.get("notes") || null,
    });
  }
  return <form className="editor-card modal-form" onSubmit={submit}>
    <div className="editor-heading"><div><h2>Edit supplier item price</h2><p>{price.supplierName} · Entered by {price.requestedBy.fullName}</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Close form"><X size={18} /></button></div>
    <div className="form-grid">
      <Field label="Unit price (LKR)" name="unitPrice" type="number" required defaultValue={price.unitPrice} />
      <Field label="Supplier contact" name="givenBy" defaultValue={price.givenBy ?? ""} />
      <Field label="Price received date" name="receivedAt" type="date" defaultValue={price.receivedAt.slice(0, 10)} />
      <Field label="Price valid until" name="validUntil" type="date" defaultValue={price.validUntil?.slice(0, 10) ?? ""} />
      <label className="field field-wide"><span>Notes</span><textarea name="notes" rows={3} defaultValue={price.notes ?? ""} /></label>
    </div>
    <FormActions onCancel={onCancel} label="Save price changes" />
  </form>;
}

function QuotationPrint({ tender, quotation }: { tender: TenderRecord; quotation: Quotation }) {
  const company = tender.company;
  return <div>
    <h1>{company?.companyName || "Quotation"}</h1>
    {company && <p>{company.address}<br />{company.email} · {company.officePhone1}</p>}
    <hr />
    <h2>Quotation · {tender.referenceNumber} · V{quotation.version}</h2>
    <p>To: {tender.institution.name} · Date: {formatDate(quotation.createdAt)} · Valid for {quotation.validityDays} days</p>
    <table><thead><tr><th>ITEM</th><th>SPECIFICATION</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT (LKR)</th></tr></thead><tbody>{quotation.lines.map((line) => <tr key={line.id}>
      <td>{line.tenderItem.description}</td><td>{line.tenderItem.specification || "—"}</td><td>{line.quantity}</td><td>{currency(line.sellingUnitPrice)}</td><td>{currency(line.lineSubtotal)}</td>
    </tr>)}</tbody></table>
    <div className="print-totals"><p>Subtotal: {currency(quotation.subtotal)}</p>{Number(quotation.discountAmount) > 0 && <p>Discount: {currency(quotation.discountAmount)}</p>}<p>VAT ({quotation.vatRate}%): {currency(quotation.vatAmount)}</p><h3>Total: {currency(quotation.totalAmount)}</h3></div>
    {quotation.terms && <p>Terms: {quotation.terms}</p>}
  </div>;
}

function MasterOptions({ title, kind, values, canCreate, canManage, onAdd, onUpdate, onToggle }: {
  title: string;
  kind: MasterKind;
  values: (ItemCategory | Brand | Unit)[];
  canCreate: boolean;
  canManage: boolean;
  onAdd: (event: FormEvent<HTMLFormElement>, kind: MasterKind) => Promise<boolean>;
  onUpdate: (event: FormEvent<HTMLFormElement>, kind: MasterKind, value: ItemCategory | Brand | Unit) => Promise<boolean>;
  onToggle: (kind: MasterKind, value: ItemCategory | Brand | Unit) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ItemCategory | Brand | Unit | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const saved = editing ? await onUpdate(event, kind, editing) : await onAdd(event, kind);
    if (saved) {
      setEditorOpen(false);
      setEditing(null);
    }
  }
  return <div className="master-options">
    <div className="card-heading"><h3>{title}</h3>{canCreate && <button type="button" className="secondary-button" onClick={() => { setEditing(null); setEditorOpen(true); }}>＋ Add {kind === "units" ? "unit" : kind === "categories" ? "category" : "brand"}</button>}</div>
    <div className="table-card"><table><thead><tr><th>NAME</th>{kind === "units" && <th>ABBREVIATION</th>}<th>STATUS</th>{canManage && <th />}</tr></thead><tbody>{values.length ? values.map((value) => <tr key={value.id}>
      <td>{value.name}</td>{kind === "units" && <td>{"abbreviation" in value ? value.abbreviation : "—"}</td>}<td><StatusBadge status={value.active ? "ACTIVE" : "INACTIVE"} /></td>
      {canManage && <td className="table-actions"><button type="button" className="text-button" onClick={() => { setEditing(value); setEditorOpen(true); }}>Edit</button><button type="button" className="text-button" onClick={() => onToggle(kind, value)}>{value.active ? "Deactivate" : "Reactivate"}</button></td>}
    </tr>) : <tr><td colSpan={(kind === "units" ? 3 : 2) + Number(canManage)}>No {title.toLowerCase()} found.</td></tr>}</tbody></table></div>
    {editorOpen && <Modal title={editing ? `Edit ${kind === "units" ? "unit" : kind === "categories" ? "category" : "brand"}` : `Add ${kind === "units" ? "unit" : kind === "categories" ? "category" : "brand"}`} onClose={() => { setEditorOpen(false); setEditing(null); }}>
      <form key={editing?.id ?? "new-master"} className="editor-card modal-form" onSubmit={(event) => void submit(event)}>
        <div className="editor-heading"><div><h2>{editing ? `Edit ${kind === "units" ? "unit" : kind === "categories" ? "category" : "brand"}` : `Add ${kind === "units" ? "unit" : kind === "categories" ? "category" : "brand"}`}</h2><p>Keep this catalogue value consistent across item records.</p></div></div>
        <div className="form-grid">
          <Field label={kind === "units" ? "Unit name" : kind === "categories" ? "Category name" : "Brand name"} name="name" required defaultValue={editing?.name ?? ""} />
          {kind === "units" && <Field label="Abbreviation" name="abbreviation" required defaultValue={editing && "abbreviation" in editing ? editing.abbreviation : ""} />}
        </div>
        <div className="form-actions"><button className="primary-button" type="submit">{editing ? "Save changes" : "Add"}</button><button className="secondary-button" type="button" onClick={() => { setEditorOpen(false); setEditing(null); }}>Cancel</button></div>
      </form>
    </Modal>}
  </div>;
}

function ItemsTable({ rows, canManage, onEdit, onDeactivate }: { rows: Item[]; canManage: boolean; onEdit: (row: Item) => void; onDeactivate: (row: Item) => void }) {
  return <table>
    <thead><tr><th>ITEM CODE</th><th>ITEM</th><th>CATEGORY</th><th>BRAND / MODEL</th><th>WARRANTY</th><th>STATUS</th>{canManage && <th />}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>
      <td><strong>{row.code}</strong></td>
      <td><div className="primary-cell"><span className="item-avatar"><Package size={16} /></span><span><strong>{row.name}</strong><small>{row.unit.name}</small></span></div></td>
      <td>{row.category?.name || "—"}</td>
      <td>{[row.brand?.name, row.modelSpecification].filter(Boolean).join(" / ") || "—"}</td>
      <td>{row.warrantyMonths ? `${row.warrantyMonths} months` : "—"}</td>
      <td><StatusBadge status={row.active ? "ACTIVE" : "INACTIVE"} /></td>
      {canManage && <td><RowActions onEdit={() => onEdit(row)} onDeactivate={row.active ? () => onDeactivate(row) : undefined} /></td>}
    </tr>)}</tbody>
  </table>;
}

function CompetitorTable({ rows, canManage, onEdit, onDeactivate }: { rows: Competitor[]; canManage: boolean; onEdit: (row: Competitor) => void; onDeactivate: (row: Competitor) => void }) {
  return <table><thead><tr><th>COMPETITOR</th><th>CONTACT</th><th>AREA</th><th>STATUS</th>{canManage && <th />}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="primary-cell"><span className="competitor-avatar">{initials(row.name)}</span><span><strong>{row.name}</strong><small>{row.contactPerson || "No contact person"}</small></span></div></td><td>{row.contactNumber || "—"}</td><td>{[row.district, row.province].filter(Boolean).join(", ") || "—"}</td><td><StatusBadge status={row.active ? "ACTIVE" : "INACTIVE"} /></td>{canManage && <td><RowActions onEdit={() => onEdit(row)} onDeactivate={row.active ? () => onDeactivate(row) : undefined} /></td>}</tr>)}</tbody></table>;
}

function SuppliersTable({ rows, canManage, onEdit, onToggle }: { rows: Supplier[]; canManage: boolean; onEdit: (row: Supplier) => void; onToggle: (row: Supplier) => void }) {
  return <table><thead><tr><th>SUPPLIER</th><th>CONTACT</th><th>EMAIL</th><th>STATUS</th>{canManage && <th />}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
    <td><div className="primary-cell"><span className="competitor-avatar">{initials(row.name)}</span><span><strong>{row.name}</strong><small>{row.address || "No address"}</small></span></div></td>
    <td>{row.contactPerson || "—"}<small className="sub-cell">{row.contactNumber || "No phone number"}</small></td>
    <td>{row.email || "—"}</td>
    <td><StatusBadge status={row.active ? "ACTIVE" : "INACTIVE"} /></td>
    {canManage && <td className="supplier-actions"><button type="button" className="text-button" onClick={() => onEdit(row)}>Edit</button><button type="button" className="text-button" onClick={() => onToggle(row)}>{row.active ? "Deactivate" : "Reactivate"}</button></td>}
  </tr>)}</tbody></table>;
}

function InstitutionTable({ rows }: { rows: Institution[] }) {
  return <table><thead><tr><th>INSTITUTION</th><th>PROVINCE</th><th>DISTRICT</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="primary-cell"><span className="institution-avatar"><Building2 size={16} /></span><span><strong>{row.name}</strong></span></div></td><td>{row.province || "—"}</td><td>{row.district || "—"}</td></tr>)}</tbody></table>;
}

function PaymentDocumentControl({ paymentId, type, document, onUpload, onRemove }: {
  paymentId: string;
  type: PaymentDocumentType;
  document?: RegistrationPaymentDocument;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const label = type === "CHEQUE_IMAGE" ? "Cheque photo" : "Receipt copy";
  return <div className="payment-document-control">
    <span className="payment-document-label">{label}</span>
    {document
      ? <a href={`${API_BASE}/api/registration-payments/${paymentId}/documents/${type}`} target="_blank" rel="noreferrer" className="payment-document-link">{document.fileName}</a>
      : <span className="payment-document-missing">Not uploaded</span>}
    <label className="payment-document-upload">{document ? "Replace" : "Upload"}<input
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) onUpload(file);
        event.currentTarget.value = "";
      }}
    /></label>
    {document && <button type="button" className="text-button payment-document-remove" onClick={onRemove}>Remove</button>}
  </div>;
}

function RegistrationTable({ rows, canRenew, canRecordPayment, onRenew, onPayment }: { rows: Registration[]; canRenew: boolean; canRecordPayment: boolean; onRenew: (row: Registration) => void; onPayment: (row: Registration) => void }) {
  return <table><thead><tr><th>INSTITUTION</th><th>YEAR</th><th>REGISTERED ITEMS</th><th>FEE / BOND</th><th>EXPIRY</th><th>STATUS</th>{(canRenew || canRecordPayment) && <th />}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="primary-cell"><span className="institution-avatar"><Building2 size={16} /></span><span><strong>{row.institution.name}</strong><small>{[row.institution.district, row.institution.province].filter(Boolean).join(", ") || "Institution"}</small></span></div></td><td>{row.year}</td><td>{row.items.length ? row.items.map((entry) => entry.item.name).join(", ") : "—"}</td><td>{currency(row.registrationFee)}<small className="sub-cell">Bond {currency(row.bondAmount)}</small></td><td>{formatDate(row.expiryDate)}<small className="sub-cell">{row.daysUntilExpiry >= 0 ? `${row.daysUntilExpiry} days left` : `${Math.abs(row.daysUntilExpiry)} days overdue`}</small></td><td><StatusBadge status={row.status} /></td>{(canRenew || canRecordPayment) && <td className="table-actions">{canRenew && row.status !== "RENEWED" && <button className="small-button" onClick={() => onRenew(row)}>Renew</button>}{canRecordPayment && <button className="text-button" onClick={() => onPayment(row)}>＋ Payment</button>}</td>}</tr>)}</tbody></table>;
}

function UsersTable({ rows, currentUser, onEdit, onToggle }: { rows: (User & { active?: boolean })[]; currentUser: User; onEdit: (row: User & { active?: boolean }) => void; onToggle: (row: User & { active?: boolean }) => void }) {
  return <table><thead><tr><th>USER</th><th>ROLE</th><th>ASSIGNED AREAS</th><th>STATUS</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="primary-cell"><span className="avatar table-avatar">{initials(row.fullName)}</span><span><strong>{row.fullName}</strong><small>{row.email}</small></span></div></td><td>{row.customRoleName ?? roleLabels[row.role]}</td><td>{row.areaAssignments?.length ? row.areaAssignments.map(({ province, district }) => district ? `${district}, ${province}` : `${province} (all)`).join("; ") : "—"}</td><td><StatusBadge status={row.active === false ? "INACTIVE" : "ACTIVE"} /></td><td className="table-actions"><button className="text-button" onClick={() => onEdit(row)}>Edit</button>{row.id !== currentUser.id && <button className="text-button" onClick={() => onToggle(row)}>{row.active === false ? "Reactivate" : "Deactivate"}</button>}</td></tr>)}</tbody></table>;
}

function CustomRolesTable({ rows, onEdit, onDelete }: { rows: CustomRole[]; onEdit: (role: CustomRole) => void; onDelete: (role: CustomRole) => void }) {
  if (!rows.length) return <EmptyState icon={<ShieldCheck size={20} />} title="No custom roles" message="Create a role to define a restricted set of permissions for users." />;
  return <table><thead><tr><th>ROLE</th><th>BASED ON</th><th>PERMISSIONS</th><th>USERS</th><th /></tr></thead><tbody>{rows.map((role) => <tr key={role.id}><td><strong>{role.name}</strong></td><td>{roleLabels[role.baseRole]}</td><td>{role.permissions.length}</td><td>{role._count.users}</td><td className="table-actions"><button className="text-button" onClick={() => onEdit(role)}>Edit</button><button className="text-button" disabled={role._count.users > 0} title={role._count.users ? "Reassign users before deleting this role" : undefined} onClick={() => onDelete(role)}>Delete</button></td></tr>)}</tbody></table>;
}

function BuiltInRolesTable({ roles, permissionCatalog }: { roles: Role[]; permissionCatalog: PermissionDefinition[] }) {
  return <table><thead><tr><th>ROLE</th><th>PERMISSIONS</th><th>ACCESS AREAS</th></tr></thead><tbody>{roles.map((role) => {
    const permissions = permissionCatalog.filter((permission) => permission.roles.includes(role));
    const modules = [...new Set(permissions.map((permission) => permission.module))];
    return <tr key={role}><td><strong>{roleLabels[role]}</strong></td><td>{permissions.length}</td><td>{modules.join(", ")}</td></tr>;
  })}</tbody></table>;
}

function NotificationsPage({ notices, onAcknowledge, onSnooze }: {
  notices: Notice[];
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  return <div className="content-card notification-page"><div className="card-heading"><div><h2>Notifications</h2><p>Tender, registration, bond, pricing and approval alerts.</p></div><span className="record-count">{notices.length} alerts</span></div>{notices.length === 0 ? <EmptyState icon={<Bell size={20} />} title="No notifications" message="Operational alerts will appear here." /> : <div className="attention-list">{notices.map((notice) => <div className="attention-row" key={notice.id}><div className="attention-marker"><Bell size={15} /></div><div className="attention-copy"><strong>{notice.title}</strong><span>{notice.message}</span>{notice.acknowledgedAt && <small>Acknowledged {formatDate(notice.acknowledgedAt)}</small>}{notice.snoozedUntil && !notice.acknowledgedAt && <small>Snoozed until {formatDate(notice.snoozedUntil)}</small>}</div><span className="notice-date">{formatDate(notice.createdAt)}</span>{notice.recipientId && !notice.acknowledgedAt && <div className="row-actions"><button type="button" className="text-button" onClick={() => onSnooze(notice.id)}>Snooze 1 day</button><button type="button" className="small-button" onClick={() => onAcknowledge(notice.id)}>Acknowledge</button></div>}</div>)}</div>}</div>;
}

function DocumentAttachments({ title, documents, basePath, canManage, typeOptions, onUpload, onDownload, onDelete }: {
  title: string;
  documents: FileAttachment[];
  basePath: string;
  canManage: boolean;
  typeOptions?: { value: NonNullable<FileAttachment["type"]>; label: string }[];
  onUpload: (path: string, file: File, type?: string) => Promise<boolean>;
  onDownload: (path: string, fileName: string) => void;
  onDelete: (path: string, message: string) => Promise<boolean>;
}) {
  const [uploading, setUploading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("document");
    if (!(file instanceof File) || file.size === 0) return;
    setUploading(true);
    try {
      const saved = await onUpload(basePath, file, typeOptions ? String(values.get("documentType")) : undefined);
      if (saved) form.reset();
    } finally {
      setUploading(false);
    }
  }
  return <section className="results-subsection document-attachments">
    <h4>{title}</h4>
    {documents.length === 0 ? <p className="results-empty">No documents uploaded.</p> : <div className="document-list">{documents.map((file) => (
      <div className="document-row" key={file.id}>
        <div><strong>{file.fileName}</strong><small>{file.type?.replaceAll("_", " ") ?? file.contentType} · {formatDate(file.createdAt)}</small></div>
        <div className="document-actions">
          <button type="button" className="small-button" onClick={() => onDownload(`${basePath}/${file.id}`, file.fileName)}>Download</button>
          {canManage && <button type="button" className="text-button" onClick={() => {
            if (window.confirm(`Delete "${file.fileName}"?`)) void onDelete(`${basePath}/${file.id}`, "Document deleted.");
          }}>Delete</button>}
        </div>
      </div>
    ))}</div>}
    {canManage && <form className="document-upload-form" onSubmit={(event) => void submit(event)}>
      {typeOptions && <label className="field"><span>Document type</span><select name="documentType" defaultValue="TENDER_DOCUMENT">{typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
      <label className="field"><span>File (PDF, JPEG, PNG or WebP; up to 20 MB)</span><input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required /></label>
      <button className="secondary-button" disabled={uploading}>{uploading ? "Uploading…" : "Upload document"}</button>
    </form>}
  </section>;
}

function UserRoleAndAreaFields({ builtInRoles, customRoles, areas, selectedRole, assignments }: {
  builtInRoles: Role[];
  customRoles: CustomRole[];
  areas: Area[];
  selectedRole: string;
  assignments: { province: string; district: string | null }[];
}) {
  const [roleValue, setRoleValue] = useState(selectedRole);
  const selectedCustomRole = customRoles.find((role) => roleValue === `custom:${role.id}`);
  const baseRole = selectedCustomRole?.baseRole ?? roleValue as Role;
  const assignedAreas = new Set(assignments.map(({ province, district }) => `${province}::${district ?? ""}`));
  return <>
    <label className="field"><span>Assigned role</span><select name="role" required value={roleValue} onChange={(event) => setRoleValue(event.target.value)}>
      <optgroup label="Built-in roles">{builtInRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</optgroup>
      {customRoles.length > 0 && <optgroup label="Custom roles">{customRoles.map((role) => <option key={role.id} value={`custom:${role.id}`}>{role.name} · {roleLabels[role.baseRole]}</option>)}</optgroup>}
    </select></label>
    {baseRole === "SALES_REP" && <fieldset className="area-assignment-group">
      <legend>Assigned tender areas</legend>
      <p className="field-hint">A Sales Rep can view and work on tenders in these areas, as well as tenders assigned directly to them.</p>
      {areas.map((area) => <div className="area-assignment-province" key={area.province}>
        <strong>{area.province}</strong>
        <label><input type="checkbox" name="areaAssignments" value={`${area.province}::`} defaultChecked={assignedAreas.has(`${area.province}::`)} /><span>All districts</span></label>
        <div>{area.districts.map((district) => <label key={district}><input type="checkbox" name="areaAssignments" value={`${area.province}::${district}`} defaultChecked={assignedAreas.has(`${area.province}::${district}`)} /><span>{district}</span></label>)}</div>
      </div>)}
    </fieldset>}
  </>;
}

function AreaFields({ areas, provinceDefault = "", districtDefault = "" }: { areas: Area[]; provinceDefault?: string; districtDefault?: string }) {
  const [province, setProvince] = useState(provinceDefault);
  const districtOptions = areas.find((area) => area.province === province)?.districts ?? [];
  return <>
    <label className="field"><span>Province</span><select name="province" value={province} onChange={(event) => setProvince(event.target.value)}><option value="">Select province</option>{areas.map((area) => <option key={area.province} value={area.province}>{area.province}</option>)}</select></label>
    <label className="field"><span>District</span><select name="district" defaultValue={districtDefault} disabled={!province}><option value="">Select district</option>{districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}</select></label>
  </>;
}

function Field({ label, name, type = "text", required = false, defaultValue, minLength }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string | number; minLength?: number }) {
  return <label className="field"><span>{label}{required && <i> *</i>}</span><input name={name} type={type} required={required} minLength={minLength} defaultValue={defaultValue} /></label>;
}

function FormActions({ onCancel, label = "Save record" }: { onCancel?: () => void; label?: string }) {
  return <div className="form-actions">{onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>}<button className="primary-button">{label}<span>→</span></button></div>;
}

function RowActions({ onEdit, onDeactivate }: { onEdit: () => void; onDeactivate?: () => void }) {
  return <div className="row-actions"><button type="button" title="Edit" aria-label="Edit" onClick={onEdit}><FileText size={16} /></button>{onDeactivate && <button type="button" title="Deactivate" aria-label="Deactivate" onClick={onDeactivate}><Archive size={16} /></button>}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const tone = status === "ACTIVE" ? "green" : status === "EXPIRING_SOON" ? "amber" : status === "EXPIRED" || status === "INACTIVE" ? "red" : "slate";
  return <span className={`status-badge ${tone}`}><i />{label}</span>;
}

function EmptyState({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
  return <div className="empty-state"><div>{icon}</div><strong>{title}</strong><span>{message}</span></div>;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function timeOfDay(date: Date): string {
  const hour = date.getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function pageSubtitle(page: Page): string {
  const subtitles: Record<Page, string> = {
    dashboard: "Here’s your workspace at a glance.",
    reports: "Review tender outcomes, sales performance, competitor bids, and procurement status.",
    tenders: "Track tender opportunities, supplier costs, bonds, and customer quotations.",
    items: "Maintain a consistent catalogue of the items your team tenders for.",
    competitors: "Build a reliable record of the companies bidding alongside you.",
    institutions: "Maintain customer and government organizations for supplier registrations.",
    registrations: "Track supplier registration history, payments, renewals, and deadlines.",
    categories: "Organize item catalogue records with database-managed categories.",
    brands: "Maintain the brands available when creating or updating items.",
    units: "Maintain the units available when creating or updating items.",
    suppliers: "Manage supplier records used when entering tender prices.",
    company: "Manage your organisation profile and pricing defaults.",
    users: "Control who can access TQMS and what they are allowed to do.",
    roles: "Create restricted custom roles and manage their permissions.",
    notifications: "Review reminders that need your attention.",
    security: "Protect your account and active sessions.",
  };
  return subtitles[page];
}

export default App;
