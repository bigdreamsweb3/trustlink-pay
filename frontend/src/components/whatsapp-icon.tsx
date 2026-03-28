"use client";

type WhatsAppIconProps = {
  className?: string;
};

export function WhatsAppIcon({ className = "h-4 w-4" }: WhatsAppIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand-logos/whatsapp.svg"
      alt=""
      aria-hidden="true"
      className={className}
    />
  );
}
