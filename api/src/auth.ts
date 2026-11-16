import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { baseRolePermissions, hasPermission, permissionForRoute } from "./permissions.js";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "DIRECTOR" | "TENDER_MANAGER" | "SALES_REP" | "COSTING" | "ACCOUNTS";
  customRoleId: string | null;
  customRoleName: string | null;
  permissions: string[];
};

type SessionClaims = JwtPayload & { csrf: string; version: number };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      csrfToken?: string;
    }
  }
}

const cookieName = "tqms_session";
const secureCookie = config.NODE_ENV === "production";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: secureCookie,
    sameSite: secureCookie ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  };
}

export function issueSession(user: AuthUser, version: number, response: Response): string {
  const csrf = randomBytes(32).toString("base64url");
  const token = jwt.sign({ sub: user.id, csrf, role: user.role, version }, config.JWT_SECRET, {
    expiresIn: "8h",
  });
  response.cookie(cookieName, token, sessionCookieOptions());
  return csrf;
}

export function clearSession(response: Response): void {
  response.clearCookie(cookieName, sessionCookieOptions());
}

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = request.cookies?.[cookieName] as string | undefined;
  if (!token) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  let claims: SessionClaims;
  try {
    claims = jwt.verify(token, config.JWT_SECRET) as SessionClaims;
  } catch {
    response.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  if (
    typeof claims.sub !== "string" ||
    typeof claims.csrf !== "string" ||
    typeof claims.version !== "number"
  ) {
    response.status(401).json({ error: "Invalid session" });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id: claims.sub, active: true },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      customRoleId: true,
      customRole: { select: { name: true, baseRole: true, permissions: true } },
      sessionVersion: true,
    },
  });
  if (!user || claims.version !== user.sessionVersion || user.customRoleId && !user.customRole) {
    response.status(401).json({ error: "Invalid session" });
    return;
  }
  const permissions = user.customRole
    ? Array.isArray(user.customRole.permissions)
      ? user.customRole.permissions.filter((permission): permission is string => typeof permission === "string")
      : []
    : undefined;
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.customRole?.baseRole ?? user.role,
    customRoleId: user.customRoleId,
    customRoleName: user.customRole?.name ?? null,
    permissions: permissions ?? baseRolePermissions[user.role],
  };
  if (user.customRoleId) {
    const routePath = typeof request.route?.path === "string" ? request.route.path : "";
    const permission = request.path.startsWith("/api/auth/")
      ? undefined
      : permissionForRoute(request.method, routePath);
    if (
      permission && !hasPermission(authUser.role, permissions, permission) ||
      !permission && !request.path.startsWith("/api/auth/")
    ) {
      response.status(403).json({ error: "Your role does not have permission to perform this action" });
      return;
    }
  }
  request.user = authUser;
  request.csrfToken = claims.csrf;
  next();
}

export function requireCsrf(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const supplied = request.get("x-csrf-token");
  const expected = request.csrfToken;
  if (
    !supplied ||
    !expected ||
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    response.status(403).json({ error: "Invalid CSRF token" });
    return;
  }
  next();
}

export function allowRoles(...roles: AuthUser["role"][]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.user || !roles.includes(request.user.role)) {
      response.status(403).json({ error: "You do not have permission to perform this action" });
      return;
    }
    next();
  };
}
