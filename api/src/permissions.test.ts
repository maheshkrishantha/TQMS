import assert from "node:assert/strict";
import test from "node:test";
import { baseRolePermissions, hasPermission, permissionForRoute } from "./permissions.js";

test("custom permissions only grant explicitly selected access", () => {
  assert.equal(hasPermission("SALES_REP", ["tenders.view"], "tenders.view"), true);
  assert.equal(hasPermission("SALES_REP", ["tenders.view"], "pricingCosts.view"), false);
});

test("built-in permissions follow the role catalog", () => {
  assert.equal(baseRolePermissions.ADMIN.includes("company.edit"), true);
  assert.equal(baseRolePermissions.SALES_REP.includes("quotations.prepare"), true);
  assert.equal(baseRolePermissions.SALES_REP.includes("pricingCosts.view"), false);
});

test("API routes map to the expected permission and unknown routes stay unmapped", () => {
  assert.equal(permissionForRoute("GET", "/api/tenders"), "tenders.view");
  assert.equal(permissionForRoute("GET", "/api/banks"), "tenders.view");
  assert.equal(permissionForRoute("POST", "/api/items/import"), "items.manage");
  assert.equal(permissionForRoute("PATCH", "/api/tenders/123/bid-bond"), "tenders.create");
  assert.equal(permissionForRoute("POST", "/api/tenders/123/documents"), "tenders.create");
  assert.equal(permissionForRoute("GET", "/api/tenders/123/documents/456"), "tenders.view");
  assert.equal(permissionForRoute("POST", "/api/purchase-orders/123/documents"), "purchaseOrders.manage");
  assert.equal(permissionForRoute("POST", "/api/tenders/123/expected-bidders"), "readings.manage");
  assert.equal(permissionForRoute("DELETE", "/api/tenders/123/expected-bidders/456"), "readings.manage");
  assert.equal(permissionForRoute("POST", "/api/quotations/123/approve"), "quotations.approve");
  assert.equal(permissionForRoute("POST", "/api/notifications/123/acknowledge"), "notifications.view");
  assert.equal(permissionForRoute("PATCH", "/api/notifications/123/snooze"), "notifications.view");
  assert.equal(permissionForRoute("DELETE", "/api/users/123"), undefined);
});
