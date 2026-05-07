import { buildTrustLinkSessionCodeMessage } from "./message";

export function buildTrustLinkWhatsAppHandoffMessage(sessionCode: string) {
  return buildTrustLinkSessionCodeMessage(sessionCode);
}

export function buildTrustLinkWhatsAppWebUrl(params: { phoneNumber: string; sessionCode: string }) {
  const formattedNumber = params.phoneNumber.replace(/[^0-9]/g, "");
  const encodedMessage = encodeURIComponent(buildTrustLinkWhatsAppHandoffMessage(params.sessionCode));
  return `https://api.whatsapp.com/send/?phone=${formattedNumber}&text=${encodedMessage}&type=phone_number&app_absent=0`;
}

export function buildTrustLinkWhatsAppNativeUrl(params: { phoneNumber: string; sessionCode: string }) {
  const formattedNumber = params.phoneNumber.replace(/[^0-9]/g, "");
  const encodedMessage = encodeURIComponent(buildTrustLinkWhatsAppHandoffMessage(params.sessionCode));
  return `whatsapp://send?phone=${formattedNumber}&text=${encodedMessage}`;
}
