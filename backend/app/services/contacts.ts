import {
  deleteContactById,
  listContactsByUserId,
  searchContactsByUserId,
  upsertContact,
} from "@/app/db/contacts";
import type { AuthenticatedUser } from "@/app/types/auth";
import type {
  TrustLinkContact,
  TrustLinkContactRecord,
  TrustLinkContactSource,
} from "@/app/types/contact";

function mapContact(record: TrustLinkContactRecord): TrustLinkContact {
  return {
    id: record.id,
    displayName: record.display_name,
    phoneNumber: record.phone_number,
    tin: record.tin,
    trustlinkHandle: record.trustlink_handle,
    source: record.source,
    lastPaidAt: record.last_paid_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function listContactsForUser(
  authUser: AuthenticatedUser,
): Promise<TrustLinkContact[]> {
  const contacts = await listContactsByUserId(authUser.id);
  return contacts.map(mapContact);
}

export async function searchContactsForUser(params: {
  authUser: AuthenticatedUser;
  query: string;
}): Promise<TrustLinkContact[]> {
  const query = params.query.trim();
  const contacts = query
    ? await searchContactsByUserId({
        userId: params.authUser.id,
        query,
      })
    : await listContactsByUserId(params.authUser.id);

  return contacts.map(mapContact);
}

export async function saveContactForUser(params: {
  authUser: AuthenticatedUser;
  displayName: string;
  phoneNumber?: string | null;
  tin?: string | null;
  trustlinkHandle?: string | null;
  source: TrustLinkContactSource;
  markPaid?: boolean;
}): Promise<TrustLinkContact> {
  const displayName = normalizeDisplayName(params.displayName);

  if (!displayName) {
    throw new Error("Contact name is required");
  }

  const contact = await upsertContact({
    userId: params.authUser.id,
    displayName,
    phoneNumber: params.phoneNumber,
    tin: params.tin,
    trustlinkHandle: params.trustlinkHandle,
    source: params.source,
    markPaid: params.markPaid,
  });

  return mapContact(contact);
}

export async function removeContactForUser(params: {
  authUser: AuthenticatedUser;
  contactId: string;
}): Promise<TrustLinkContact> {
  const contact = await deleteContactById({
    userId: params.authUser.id,
    contactId: params.contactId,
  });

  if (!contact) {
    throw new Error("Contact not found");
  }

  return mapContact(contact);
}
