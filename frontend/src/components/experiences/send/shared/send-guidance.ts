export type SendGuidance = {
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: "/app/identity";
};

export function getSendGuidance(errorMessage: string | null): SendGuidance | null {
  if (!errorMessage) return null;

  if (/secure wallet setup before sending invite escrow payments/i.test(errorMessage)) {
    return {
      title: "Finish secure wallet setup first",
      message:
        "Before you can send invite escrow payments, create your TIN in Identity Center so TrustLink can route phone-number payments through Transfer Identity.",
      ctaLabel: "Open Identity Center",
      ctaHref: "/app/identity",
    };
  }

  return null;
}
