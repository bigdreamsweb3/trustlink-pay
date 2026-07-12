export type TrustLinkContactSource =
  | "manual"
  | "payment"
  | "device_import"
  | "tin_lookup";

export interface TrustLinkContactRecord {
  id: string;
  user_id: string;
  display_name: string;
  phone_number: string | null;
  tin: string | null;
  trustlink_handle: string | null;
  source: TrustLinkContactSource;
  last_paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrustLinkContact {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  tin: string | null;
  trustlinkHandle: string | null;
  source: TrustLinkContactSource;
  lastPaidAt: string | null;
  createdAt: string;
  updatedAt: string;
}
