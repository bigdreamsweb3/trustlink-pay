/**
 * TSN V1 Privacy Services
 * 
 * Backend services for the privacy-preserving architecture:
 * - Device registration and management
 * - Private session management
 * - Encrypted receipt storage
 */

// Device services
export * from "./device";
export type {
  DeviceRegistryRecord,
  DeviceStatus,
} from "@/app/types/privacy";

// Session services
export * from "./session";
export type {
  PrivateSessionRecord,
  SessionStatus,
  SessionPermissions,
} from "@/app/types/privacy";

// Receipt services
export * from "./receipt";
export type {
  PrivateReceiptRecord,
  EncryptionMetadata,
  PrivateReceiptMetadataResponse,
} from "@/app/types/privacy";

// Re-export common types
export {
  DEFAULT_SESSION_PERMISSIONS,
  SESSION_TTL,
} from "@/app/types/privacy";
