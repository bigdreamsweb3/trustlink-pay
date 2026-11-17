export {
  detectDevice,
  shouldUseQRCode,
  shouldUseDirectLink,
  shouldUseDirectLink as shouldUseDirectWhatsAppFlow,
  generateWhatsAppUrl,
  generateQRCodeData,
  generateQRCodeData as generateQrCodeData,
} from "@/src/lib/whatsapp";

export function shouldUsePortalFlow() {
  return false;
}
