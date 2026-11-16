import bcrypt from "bcryptjs";
import { config } from "./config.js";
import app from "./app.js";
import { prisma } from "./db.js";
import { runNotificationJobs } from "./notifications.js";

let httpServer: ReturnType<typeof app.listen> | undefined;
let notificationTimer: NodeJS.Timeout | undefined;

async function ensureInitialAdministrator() {
  const existing = await prisma.user.findFirst({
    where: { role: "ADMIN", customRoleId: null, active: true },
  });
  if (existing) return;
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD || config.ADMIN_PASSWORD.length < 12) {
    throw new Error("No active Administrator exists. Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters to bootstrap one.");
  }
  const email = config.ADMIN_EMAIL.toLowerCase();
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    throw new Error("ADMIN_EMAIL is already assigned to a non-Administrator account.");
  }

  const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 12);
  await prisma.$transaction(async (transaction) => {
    const admin = await transaction.user.create({
      data: {
        fullName: "System Administrator",
        email,
        passwordHash,
        role: "ADMIN",
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: admin.id,
        action: "BOOTSTRAP",
        entityType: "User",
        entityId: admin.id,
      },
    });
  });
  console.info("Initial administrator account created from environment configuration.");
}

async function start() {
  await prisma.$connect();
  await ensureInitialAdministrator();
  httpServer = app.listen(config.PORT, () => {
    console.info(`TQMS API listening on port ${config.PORT}`);
  });
  let notificationsRunning = false;
  const refreshNotifications = () => {
    if (notificationsRunning) return;
    notificationsRunning = true;
    void runNotificationJobs()
      .catch((error: unknown) => console.error("Failed to refresh notifications", error))
      .finally(() => { notificationsRunning = false; });
  };
  refreshNotifications();
  notificationTimer = setInterval(refreshNotifications, 60 * 60 * 1000);
}

async function shutdown() {
  if (notificationTimer) clearInterval(notificationTimer);
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  }
  await prisma.$disconnect();
}

start().catch(async (error: unknown) => {
  console.error("TQMS API failed to start", error);
  await prisma.$disconnect();
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown().catch((error: unknown) => {
      console.error("TQMS API shutdown failed", error);
      process.exitCode = 1;
    });
  });
}
