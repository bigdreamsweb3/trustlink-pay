import Image from "next/image";

type TrustLinkMarkProps = {
  className?: string;
  compact?: boolean;
};

export function TrustLinkMark({ className = "", compact = false }: TrustLinkMarkProps) {
  const size = compact ? 36 : 44;

  return (
    <div
      className={`relative grid place-items-center overflow-hidden rounded-2xl ${className}`}
      style={{ width: size, height: size }}
      aria-label="TrustLink"
    >
      <Image
        src="/trustlink-logo.png"
        alt="TrustLink Logo"
        width={size}
        height={size}
        className="h-full w-full object-cover"
        priority
      />
    </div>
  );
}
