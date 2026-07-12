import { apiDelete, apiGet, apiPost } from "@/src/lib/api";
import type {
  SaveTrustLinkContactInput,
  TrustLinkContact,
} from "@/src/lib/contacts/types";

export async function listTrustLinkContacts(accessToken: string) {
  return apiGet<{ contacts: TrustLinkContact[] }>(
    "/api/contacts",
    accessToken,
    { cache: "no-store" },
  );
}

export async function searchTrustLinkContacts(params: {
  accessToken: string;
  query: string;
}) {
  const query = params.query.trim();
  const path = query
    ? `/api/contacts?q=${encodeURIComponent(query)}`
    : "/api/contacts";

  return apiGet<{ contacts: TrustLinkContact[] }>(
    path,
    params.accessToken,
    { cache: "no-store" },
  );
}

export async function saveTrustLinkContact(params: {
  accessToken: string;
  contact: SaveTrustLinkContactInput;
}) {
  return apiPost<{ contact: TrustLinkContact }>(
    "/api/contacts",
    params.contact,
    params.accessToken,
  );
}

export async function deleteTrustLinkContact(params: {
  accessToken: string;
  contactId: string;
}) {
  return apiDelete<{ contact: TrustLinkContact }>(
    `/api/contacts/${encodeURIComponent(params.contactId)}`,
    params.accessToken,
  );
}
