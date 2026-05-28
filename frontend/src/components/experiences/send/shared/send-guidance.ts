export type SendGuidance = {
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: "/app/settings";
};

export function getSendGuidance(errorMessage: string | null): SendGuidance | null {
  if (!errorMessage) return null;

  if (/secure wallet setup before sending invite escrow payments/i.test(errorMessage)) {
    return {
      title: "Finish secure wallet setup first",
      message:
        "Before you can send invite escrow payments, create your TIN in Settings so TrustLink can route phone-number payments through TINS.",
      ctaLabel: "Open Settings",
      ctaHref: "/app/settings",
    };
  }

  return null;
}
