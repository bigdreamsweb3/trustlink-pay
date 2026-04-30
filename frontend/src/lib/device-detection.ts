/**
 * Device detection utilities for WhatsApp authentication flow
 */

export type DeviceType = "mobile" | "desktop" | "tablet";

export interface DeviceInfo {
  type: DeviceType;
  isMobile: boolean;
  isDesktop: boolean;
  isTablet: boolean;
  hasWhatsAppApp: boolean;
  userAgent: string;
}

/**
 * Detect device type based on user agent
 */
export function detectDevice(userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): DeviceInfo {
  const ua = userAgent.toLowerCase();
  
  // Mobile detection
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  
  // Tablet detection (more specific than mobile)
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(ua);
  
  // Desktop is anything that's not mobile or tablet
  const isDesktop = !isMobile && !isTablet;
  
  // WhatsApp app detection (basic heuristic)
  const hasWhatsAppApp = /whatsapp/i.test(ua) || isMobile;
  
  const deviceType: DeviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
  
  return {
    type: deviceType,
    isMobile,
    isDesktop,
    isTablet,
    hasWhatsAppApp,
    userAgent,
  };
}

/**
 * Check if device should use QR code flow
 */
export function shouldUseQRCode(deviceInfo: DeviceInfo): boolean {
  return deviceInfo.isDesktop || !deviceInfo.hasWhatsAppApp;
}

/**
 * Check if device should use direct WhatsApp link
 */
export function shouldUseDirectLink(deviceInfo: DeviceInfo): boolean {
  return deviceInfo.isMobile && deviceInfo.hasWhatsAppApp;
}

/**
 * Generate WhatsApp URL with session code
 */
export function generateWhatsAppUrl(businessNumber: string, sessionCode: string): string {
  const message = `Verify TLinkPay Code: ${sessionCode}`;
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${businessNumber.replace(/\D/g, "")}?text=${encodedMessage}`;
}

/**
 * Generate QR code data (same as WhatsApp URL)
 */
export function generateQRCodeData(businessNumber: string, sessionCode: string): string {
  return generateWhatsAppUrl(businessNumber, sessionCode);
}
