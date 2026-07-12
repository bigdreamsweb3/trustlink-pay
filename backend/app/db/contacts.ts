import { sql } from "@/app/db/client";
import type {
  TrustLinkContactRecord,
  TrustLinkContactSource,
} from "@/app/types/contact";

let contactsSchemaReady: Promise<void> | null = null;

async function ensureContactsSchema() {
  if (!contactsSchemaReady) {
    contactsSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS contacts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          display_name VARCHAR(80) NOT NULL,
          phone_number VARCHAR(32),
          tin VARCHAR(32),
          trustlink_handle VARCHAR(32),
          source VARCHAR(32) NOT NULL DEFAULT 'manual',
          last_paid_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT contacts_has_route CHECK (phone_number IS NOT NULL OR tin IS NOT NULL)
        )
      `;

      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_user_phone
        ON contacts (user_id, phone_number)
        WHERE phone_number IS NOT NULL
      `;

      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_user_tin
        ON contacts (user_id, tin)
        WHERE tin IS NOT NULL
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_contacts_user_updated
        ON contacts (user_id, updated_at DESC)
      `;
    })().catch((error) => {
      contactsSchemaReady = null;
      throw error;
    });
  }

  await contactsSchemaReady;
}

export async function listContactsByUserId(
  userId: string,
): Promise<TrustLinkContactRecord[]> {
  await ensureContactsSchema();
  const rows = (await sql`
    SELECT
      id,
      user_id,
      display_name,
      phone_number,
      tin,
      trustlink_handle,
      source,
      last_paid_at,
      created_at,
      updated_at
    FROM contacts
    WHERE user_id = ${userId}
    ORDER BY
      last_paid_at DESC NULLS LAST,
      updated_at DESC,
      display_name ASC
  `) as TrustLinkContactRecord[];

  return rows;
}

export async function searchContactsByUserId(params: {
  userId: string;
  query: string;
}): Promise<TrustLinkContactRecord[]> {
  await ensureContactsSchema();
  const pattern = `%${params.query.trim()}%`;
  const rows = (await sql`
    SELECT
      id,
      user_id,
      display_name,
      phone_number,
      tin,
      trustlink_handle,
      source,
      last_paid_at,
      created_at,
      updated_at
    FROM contacts
    WHERE user_id = ${params.userId}
      AND (
        display_name ILIKE ${pattern}
        OR phone_number ILIKE ${pattern}
        OR tin ILIKE ${pattern}
        OR trustlink_handle ILIKE ${pattern}
      )
    ORDER BY
      last_paid_at DESC NULLS LAST,
      updated_at DESC,
      display_name ASC
    LIMIT 20
  `) as TrustLinkContactRecord[];

  return rows;
}

export async function upsertContact(params: {
  userId: string;
  displayName: string;
  phoneNumber?: string | null;
  tin?: string | null;
  trustlinkHandle?: string | null;
  source: TrustLinkContactSource;
  markPaid?: boolean;
}): Promise<TrustLinkContactRecord> {
  await ensureContactsSchema();

  if (params.tin) {
    const rows = (await sql`
    INSERT INTO contacts (
      user_id,
      display_name,
      phone_number,
      tin,
      trustlink_handle,
      source,
      last_paid_at
    )
    VALUES (
      ${params.userId},
      ${params.displayName},
      ${params.phoneNumber ?? null},
      ${params.tin ?? null},
      ${params.trustlinkHandle ?? null},
      ${params.source},
      ${params.markPaid ? new Date().toISOString() : null}
    )
    ON CONFLICT (user_id, tin)
    WHERE tin IS NOT NULL
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      phone_number = COALESCE(EXCLUDED.phone_number, contacts.phone_number),
      trustlink_handle = COALESCE(EXCLUDED.trustlink_handle, contacts.trustlink_handle),
      source = EXCLUDED.source,
      last_paid_at = COALESCE(EXCLUDED.last_paid_at, contacts.last_paid_at),
      updated_at = NOW()
    RETURNING
      id,
      user_id,
      display_name,
      phone_number,
      tin,
      trustlink_handle,
      source,
      last_paid_at,
      created_at,
      updated_at
    `) as TrustLinkContactRecord[];

    return rows[0];
  }

  if (!params.phoneNumber) {
    throw new Error("Contact requires a TIN or phone number.");
  }

  const phoneRows = (await sql`
    INSERT INTO contacts (
      user_id,
      display_name,
      phone_number,
      tin,
      trustlink_handle,
      source,
      last_paid_at
    )
    VALUES (
      ${params.userId},
      ${params.displayName},
      ${params.phoneNumber ?? null},
      ${params.tin ?? null},
      ${params.trustlinkHandle ?? null},
      ${params.source},
      ${params.markPaid ? new Date().toISOString() : null}
    )
    ON CONFLICT (user_id, phone_number)
    WHERE phone_number IS NOT NULL
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      tin = COALESCE(EXCLUDED.tin, contacts.tin),
      trustlink_handle = COALESCE(EXCLUDED.trustlink_handle, contacts.trustlink_handle),
      source = EXCLUDED.source,
      last_paid_at = COALESCE(EXCLUDED.last_paid_at, contacts.last_paid_at),
      updated_at = NOW()
    RETURNING
      id,
      user_id,
      display_name,
      phone_number,
      tin,
      trustlink_handle,
      source,
      last_paid_at,
      created_at,
      updated_at
  `) as TrustLinkContactRecord[];

  return phoneRows[0];
}

export async function deleteContactById(params: {
  userId: string;
  contactId: string;
}): Promise<TrustLinkContactRecord | null> {
  await ensureContactsSchema();
  const rows = (await sql`
    DELETE FROM contacts
    WHERE id = ${params.contactId}
      AND user_id = ${params.userId}
    RETURNING
      id,
      user_id,
      display_name,
      phone_number,
      tin,
      trustlink_handle,
      source,
      last_paid_at,
      created_at,
      updated_at
  `) as TrustLinkContactRecord[];

  return rows[0] ?? null;
}
