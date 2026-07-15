export const TSN_DEVICE_PERMISSION_SCOPES = [
  "private-session:create",
  "private-receipt:read",
  "private-history:read",
  "private-balance:read",
  "private-settlement:read",
  "private-history:recover",
  "recovery:approve",
  "device:revoke",
] as const;

export type TsnDevicePermission =
  (typeof TSN_DEVICE_PERMISSION_SCOPES)[number];

export function validateTsnDevicePermissions(
  permissions: readonly string[],
): TsnDevicePermission[] {
  const allowed = new Set<string>(TSN_DEVICE_PERMISSION_SCOPES);
  const normalized = [...new Set(permissions)].sort();
  if (normalized.length === 0 || normalized.some((permission) => !allowed.has(permission))) {
    throw new Error("Device authorization contains an unsupported TSN permission scope");
  }
  return normalized as TsnDevicePermission[];
}
