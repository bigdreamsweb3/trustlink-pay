export type TrustLinkContactSource =
  | "manual"
  | "payment"
  | "device_import"
  | "tin_lookup";

export type TrustLinkContact = {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  tin: string | null;
  trustlinkHandle: string | null;
  source: TrustLinkContactSource;
  lastPaidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveTrustLinkContactInput = {
  displayName: string;
  phoneNumber?: string | null;
  tin?: string | null;
  trustlinkHandle?: string | null;
  source: TrustLinkContactSource;
  markPaid?: boolean;
};

export type DeviceContactCandidate = {
  displayName: string;
  phoneNumber: string;
};
