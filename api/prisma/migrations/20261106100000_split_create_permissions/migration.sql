UPDATE "CustomRole"
SET "permissions" =
    ("permissions" - 'institutions.manage')
    || CASE WHEN "permissions" ? 'items.manage' AND NOT ("permissions" ? 'items.create')
        THEN '["items.create"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN "permissions" ? 'competitors.manage' AND NOT ("permissions" ? 'competitors.create')
        THEN '["competitors.create"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN "permissions" ? 'institutions.manage'
        THEN '["institutions.create"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN "permissions" ? 'registrations.manage' AND NOT ("permissions" ? 'registrations.create')
        THEN '["registrations.create"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN "permissions" ? 'suppliers.manage' AND NOT ("permissions" ? 'suppliers.create')
        THEN '["suppliers.create"]'::jsonb ELSE '[]'::jsonb END;
