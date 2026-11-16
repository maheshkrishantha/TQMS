import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  CLIENT_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  SMTP_HOST: optionalNonEmptyString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: optionalNonEmptyString,
  SMTP_PASSWORD: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  SMTP_FROM: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().trim().min(3).optional(),
  ),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && !value.CLIENT_ORIGIN) {
    context.addIssue({
      code: "custom",
      path: ["CLIENT_ORIGIN"],
      message: "CLIENT_ORIGIN must be set in production",
    });
  }
  if (value.NODE_ENV === "production" && (!value.SMTP_HOST || !value.SMTP_FROM)) {
    context.addIssue({
      code: "custom",
      path: ["SMTP_HOST"],
      message: "SMTP_HOST and SMTP_FROM must be set in production",
    });
  }
  if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
    context.addIssue({
      code: "custom",
      path: ["SMTP_USER"],
      message: "SMTP_USER and SMTP_PASSWORD must be configured together",
    });
  }
});

const parsedConfig = configSchema.parse(process.env);
const clientOrigins = z.array(
  z.string().url().refine((value) => new URL(value).origin === value, "Must be an origin without a path"),
).min(1).parse(
  (parsedConfig.CLIENT_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export const config = { ...parsedConfig, CLIENT_ORIGIN: clientOrigins };
