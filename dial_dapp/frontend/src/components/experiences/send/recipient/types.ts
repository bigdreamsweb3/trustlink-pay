export type SendRecipientOption = {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  tin: string | null;
  trustlinkHandle: string | null;
  source: "contact" | "recent";
  lastUsedAt: string | null;
};

export function getRecipientRoute(option: SendRecipientOption) {
  return option.tin ?? option.phoneNumber ?? "";
}
