"use client";

import { QRCodeCanvas } from "qrcode.react";

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
  logoUrl?: string;
}

export function QRCodeDisplay({
  value,
  size = 220,
  className = "",
  logoUrl,
}: QRCodeDisplayProps) {
  return (
    <div
      className={`qr-code-container overflow-hidden rounded-[18px] bg-white ${className}`}
      aria-label="Scan with your phone camera to open WhatsApp"
    >
      <QRCodeCanvas
        value={value}
        size={size}
        level="H"
        marginSize={4}
        bgColor="#ffffff"
        fgColor="#06120b"
        imageSettings={
          logoUrl
            ? {
                src: logoUrl,
                width: Math.round(size * 0.16),
                height: Math.round(size * 0.16),
                excavate: true,
              }
            : undefined
        }
      />
    </div>
  );
}
