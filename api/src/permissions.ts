import type { Role } from "@prisma/client";

type PermissionDefinition = {
  id: string;
  module: string;
  action: string;
  label: string;
  roles: Role[];
};

const allRoles: Role[] = ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS"];
const managementRoles: Role[] = ["ADMIN", "DIRECTOR", "TENDER_MANAGER"];
const supplierPriceRoles: Role[] = ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "COSTING"];
const quotationRoles: Role[] = ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP"];
const predictionRoles: Role[] = ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING"];
const resultsRoles: Role[] = ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "SALES_REP", "COSTING", "ACCOUNTS"];
const registrationRoles: Role[] = ["ADMIN", "COSTING", "ACCOUNTS"];

export const permissionCatalog: PermissionDefinition[] = [
  { id: "dashboard.view", module: "Dashboard", action: "View", label: "View dashboard", roles: allRoles },
  { id: "reports.view", module: "Reports", action: "View", label: "View reports", roles: allRoles },
  { id: "tenders.view", module: "Tenders", action: "View", label: "View tenders", roles: allRoles },
  { id: "tenders.create", module: "Tenders", action: "Create", label: "Create tenders", roles: ["ADMIN", "TENDER_MANAGER", "SALES_REP"] },
  { id: "tenders.submit", module: "Tenders", action: "Submit", label: "Submit tenders", roles: ["ADMIN", "TENDER_MANAGER", "SALES_REP"] },
  { id: "pricingCosts.view", module: "Pricing", action: "View costs", label: "View supplier costs and margins", roles: ["ADMIN", "DIRECTOR", "TENDER_MANAGER", "COSTING"] },
  { id: "supplierPrices.manage", module: "Pricing", action: "Manage supplier prices", label: "Add and edit supplier prices", roles: supplierPriceRoles },
  { id: "quotations.prepare", module: "Quotations", action: "Prepare", label: "Prepare quotations without accessing supplier costs", roles: quotationRoles },
  { id: "quotations.approve", module: "Quotations", action: "Approve", label: "Approve or reject quotations", roles: ["ADMIN", "DIRECTOR", "TENDER_MANAGER"] },
  { id: "readings.view", module: "Tender results", action: "View readings", label: "View tender readings", roles: allRoles },
  { id: "readings.manage", module: "Tender results", action: "Manage readings", label: "Record and correct readings", roles: resultsRoles },
  { id: "awards.manage", module: "Tender results", action: "Record awards", label: "Record tender awards", roles: resultsRoles },
  { id: "purchaseOrders.manage", module: "Purchase orders", action: "Manage", label: "Create and update purchase orders", roles: resultsRoles },
  { id: "tenders.complete", module: "Tenders", action: "Complete", label: "Complete tenders", roles: managementRoles },
  { id: "predictions.use", module: "Pricing", action: "Prediction", label: "Use price predictions", roles: predictionRoles },
  { id: "items.view", module: "Item master", action: "View", label: "View item master", roles: allRoles },
  { id: "items.create", module: "Item master", action: "Create", label: "Create items, categories, brands and units", roles: ["ADMIN", "COSTING"] },
  { id: "items.manage", module: "Item master", action: "Manage", label: "Update and deactivate items, categories, brands and units", roles: ["ADMIN", "COSTING"] },
  { id: "suppliers.view", module: "Suppliers", action: "View", label: "View suppliers", roles: allRoles },
  { id: "suppliers.create", module: "Suppliers", action: "Create", label: "Add suppliers", roles: ["ADMIN"] },
  { id: "suppliers.manage", module: "Suppliers", action: "Manage", label: "Update and deactivate suppliers", roles: ["ADMIN"] },
  { id: "competitors.view", module: "Competitors", action: "View", label: "View competitors", roles: allRoles },
  { id: "competitors.create", module: "Competitors", action: "Create", label: "Add competitors", roles: ["ADMIN", "TENDER_MANAGER"] },
  { id: "competitors.manage", module: "Competitors", action: "Manage", label: "Update and deactivate competitors", roles: ["ADMIN", "TENDER_MANAGER"] },
  { id: "institutions.view", module: "Institutions", action: "View", label: "View institutions", roles: allRoles },
  { id: "institutions.create", module: "Institutions", action: "Create", label: "Add institutions", roles: registrationRoles },
  { id: "registrations.view", module: "Registrations", action: "View", label: "View registrations", roles: registrationRoles },
  { id: "registrations.create", module: "Registrations", action: "Create", label: "Create supplier registrations", roles: registrationRoles },
  { id: "registrations.manage", module: "Registrations", action: "Manage", label: "Renew supplier registrations", roles: registrationRoles },
  { id: "registrationPayments.manage", module: "Registrations", action: "Payments", label: "Manage registration payments and documents", roles: registrationRoles },
  { id: "company.view", module: "Company settings", action: "View", label: "View company settings", roles: allRoles },
  { id: "company.edit", module: "Company settings", action: "Edit", label: "Edit company settings", roles: ["ADMIN"] },
  { id: "notifications.view", module: "Notifications", action: "View", label: "View notifications", roles: allRoles },
  { id: "auditLogs.view", module: "Audit logs", action: "View", label: "View audit logs", roles: ["ADMIN", "DIRECTOR"] },
  { id: "lookups.view", module: "Reference data", action: "View", label: "View reference data", roles: allRoles },
];

export const baseRolePermissions: Record<Role, string[]> = Object.fromEntries(
  allRoles.map((role) => [role, permissionCatalog.filter((permission) => permission.roles.includes(role)).map(({ id }) => id)]),
) as Record<Role, string[]>;

const routePermissions: { method: string; path: RegExp; permission: string }[] = [
  { method: "GET", path: /^\/api\/dashboard$/, permission: "dashboard.view" },
  { method: "GET", path: /^\/api\/reports\/(?:tenders|prediction-accuracy)$/, permission: "reports.view" },
  { method: "GET", path: /^\/api\/areas$/, permission: "lookups.view" },
  { method: "GET", path: /^\/api\/banks$/, permission: "tenders.view" },
  { method: "GET", path: /^\/api\/company$/, permission: "company.view" },
  { method: "PUT", path: /^\/api\/company$/, permission: "company.edit" },
  { method: "GET", path: /^\/api\/(?:items|item-categories|brands|units)$/, permission: "items.view" },
  { method: "POST", path: /^\/api\/items\/import$/, permission: "items.manage" },
  { method: "POST", path: /^\/api\/(?:items|item-categories|brands|units)$/, permission: "items.create" },
  { method: "PUT", path: /^\/api\/(?:items|item-categories|brands|units)\/[^/]+$/, permission: "items.manage" },
  { method: "DELETE", path: /^\/api\/(?:items|item-categories|brands|units)\/[^/]+$/, permission: "items.manage" },
  { method: "GET", path: /^\/api\/suppliers$/, permission: "suppliers.view" },
  { method: "POST", path: /^\/api\/suppliers$/, permission: "suppliers.create" },
  { method: "PUT", path: /^\/api\/suppliers\/[^/]+$/, permission: "suppliers.manage" },
  { method: "DELETE", path: /^\/api\/suppliers\/[^/]+$/, permission: "suppliers.manage" },
  { method: "GET", path: /^\/api\/competitors$/, permission: "competitors.view" },
  { method: "POST", path: /^\/api\/competitors$/, permission: "competitors.create" },
  { method: "PUT", path: /^\/api\/competitors\/[^/]+$/, permission: "competitors.manage" },
  { method: "DELETE", path: /^\/api\/competitors\/[^/]+$/, permission: "competitors.manage" },
  { method: "GET", path: /^\/api\/institutions$/, permission: "institutions.view" },
  { method: "POST", path: /^\/api\/institutions$/, permission: "institutions.create" },
  { method: "GET", path: /^\/api\/registrations$/, permission: "registrations.view" },
  { method: "POST", path: /^\/api\/institutions\/[^/]+\/registrations$/, permission: "registrations.create" },
  { method: "POST", path: /^\/api\/registrations\/[^/]+\/renew$/, permission: "registrations.manage" },
  { method: "POST", path: /^\/api\/registrations\/[^/]+\/payments$/, permission: "registrationPayments.manage" },
  { method: "GET", path: /^\/api\/registration-payments\/[^/]+\/documents\/[^/]+$/, permission: "registrationPayments.manage" },
  { method: "PUT", path: /^\/api\/registration-payments\/[^/]+\/documents\/[^/]+$/, permission: "registrationPayments.manage" },
  { method: "DELETE", path: /^\/api\/registration-payments\/[^/]+\/documents\/[^/]+$/, permission: "registrationPayments.manage" },
  { method: "GET", path: /^\/api\/tender-reps$/, permission: "tenders.view" },
  { method: "GET", path: /^\/api\/tender-suppliers$/, permission: "tenders.view" },
  { method: "GET", path: /^\/api\/tenders$/, permission: "tenders.view" },
  { method: "POST", path: /^\/api\/tenders$/, permission: "tenders.create" },
  { method: "GET", path: /^\/api\/tenders\/[^/]+$/, permission: "tenders.view" },
  { method: "PATCH", path: /^\/api\/tenders\/[^/]+\/bid-bond$/, permission: "tenders.create" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/documents$/, permission: "tenders.create" },
  { method: "GET", path: /^\/api\/tenders\/[^/]+\/documents\/[^/]+$/, permission: "tenders.view" },
  { method: "DELETE", path: /^\/api\/tenders\/[^/]+\/documents\/[^/]+$/, permission: "tenders.create" },
  { method: "GET", path: /^\/api\/tenders\/[^/]+\/results$/, permission: "readings.view" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/readings$/, permission: "readings.manage" },
  { method: "PUT", path: /^\/api\/reading-bids\/[^/]+$/, permission: "readings.manage" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/expected-bidders$/, permission: "readings.manage" },
  { method: "DELETE", path: /^\/api\/tenders\/[^/]+\/expected-bidders\/[^/]+$/, permission: "readings.manage" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/awards$/, permission: "awards.manage" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/purchase-orders$/, permission: "purchaseOrders.manage" },
  { method: "PATCH", path: /^\/api\/purchase-orders\/[^/]+$/, permission: "purchaseOrders.manage" },
  { method: "POST", path: /^\/api\/purchase-orders\/[^/]+\/documents$/, permission: "purchaseOrders.manage" },
  { method: "GET", path: /^\/api\/purchase-orders\/[^/]+\/documents\/[^/]+$/, permission: "readings.view" },
  { method: "DELETE", path: /^\/api\/purchase-orders\/[^/]+\/documents\/[^/]+$/, permission: "purchaseOrders.manage" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/complete$/, permission: "tenders.complete" },
  { method: "POST", path: /^\/api\/tender-items\/[^/]+\/prices$/, permission: "supplierPrices.manage" },
  { method: "PATCH", path: /^\/api\/supplier-prices\/[^/]+$/, permission: "supplierPrices.manage" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/items\/[^/]+\/price-prediction$/, permission: "predictions.use" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/quotations$/, permission: "quotations.prepare" },
  { method: "POST", path: /^\/api\/quotations\/[^/]+\/submit$/, permission: "quotations.prepare" },
  { method: "POST", path: /^\/api\/quotations\/[^/]+\/(?:approve|reject)$/, permission: "quotations.approve" },
  { method: "POST", path: /^\/api\/tenders\/[^/]+\/submit$/, permission: "tenders.submit" },
  { method: "GET", path: /^\/api\/notifications$/, permission: "notifications.view" },
  { method: "POST", path: /^\/api\/notifications\/[^/]+\/acknowledge$/, permission: "notifications.view" },
  { method: "PATCH", path: /^\/api\/notifications\/[^/]+\/snooze$/, permission: "notifications.view" },
  { method: "GET", path: /^\/api\/audit-logs$/, permission: "auditLogs.view" },
];

export function permissionForRoute(method: string, routePath: string): string | undefined {
  return routePermissions.find((entry) => entry.method === method && entry.path.test(routePath))?.permission;
}

export function hasPermission(role: Role, customPermissions: string[] | null | undefined, permission: string): boolean {
  return customPermissions
    ? customPermissions.includes(permission)
    : baseRolePermissions[role].includes(permission);
}
