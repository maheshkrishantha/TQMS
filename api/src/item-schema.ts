import { z } from "zod";

export const MAX_ITEM_IMPORT_ROWS = 2000;

export const itemSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  categoryId: z.string().min(1).max(100).optional().nullable(),
  brandId: z.string().min(1).max(100).optional().nullable(),
  modelSpecification: z.string().trim().max(1000).optional().nullable(),
  unitId: z.string().min(1).max(100),
  warrantyMonths: z.number().int().min(0).max(600).optional().nullable(),
  active: z.boolean().optional(),
});

export const itemImportSchema = z.array(itemSchema
  .omit({ categoryId: true, brandId: true })
  .extend({
    categoryId: z.string().min(1).max(100).optional().nullable(),
    brandId: z.string().min(1).max(100).optional().nullable(),
    categoryName: z.string().trim().max(100).optional().nullable(),
    brandName: z.string().trim().max(100).optional().nullable(),
  }))
  .min(1)
  .max(MAX_ITEM_IMPORT_ROWS);

export function normalizeMasterName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return trimmed.replace(/[^a-z0-9]/g, "") || trimmed;
}

export function buildMasterNameLookup<T extends { id: string; name: string; active: boolean }>(
  records: T[],
): Map<string, T> {
  return [...records]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
    .reduce((lookup, record) => {
      const key = normalizeMasterName(record.name);
      if (key && !lookup.has(key)) lookup.set(key, record);
      return lookup;
    }, new Map<string, T>());
}
