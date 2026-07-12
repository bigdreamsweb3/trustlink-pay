import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  children?: ReactNode;
  size?: number;
};

function BaseIcon({
  size,
  className = "",
  children,
  ...props
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m4 10 8-6.5 8 6.5" />
      <path d="M6.5 9.5v10h11v-10" />
      <path d="M9.5 19.5v-6h5v6" />
    </BaseIcon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 12h13" />
      <path d="m13 7 5 5-5 5" />
      <path d="M5 7.5V6a2 2 0 0 1 2-2h11" />
      <path d="M5 16.5V18a2 2 0 0 0 2 2h11" />
    </BaseIcon>
  );
}

export function ReceiveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M19 12H6" />
      <path d="m11 7-5 5 5 5" />
      <path d="M19 7.5V6a2 2 0 0 0-2-2H6" />
      <path d="M19 16.5V18a2 2 0 0 1-2 2H6" />
    </BaseIcon>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.5c1.7-3 4.1-4.5 6.5-4.5s4.8 1.5 6.5 4.5" />
    </BaseIcon>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
      <path d="M4 8h13" />
      <path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z" />
    </BaseIcon>
  );
}

export function ContactsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8.5 7.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0Z" />
      <path d="M5.5 20c1.45-3.1 3.6-4.65 6.5-4.65S17.05 16.9 18.5 20" />
      <path d="M3.5 5.5v13" />
      <path d="M20.5 5.5v13" />
    </BaseIcon>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 7h15" />
      <path d="M4.5 12h10.5" />
      <path d="M4.5 17h15" />
      <path d="M17.5 10.5v3.5" />
      <path d="M16 12.25h3" />
    </BaseIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </BaseIcon>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="2.4"
      />
      <path
        d="M12 3a9 9 0 0 1 8.4 5.75"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m15 18-6-6 6-6" />
      <path d="M10 12h8" />
    </BaseIcon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </BaseIcon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m3 3 18 18" />
      <path d="M10.6 6.4A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17.3 17.3 0 0 1-3.4 3.9" />
      <path d="M6.2 6.2A17.8 17.8 0 0 0 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3-.4" />
      <path d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9" />
    </BaseIcon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 10.25v5" />
      <circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="9" y="9" width="9" height="9" rx="2" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-1.5-1H2.5V10h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 4.2l.06.06A1.7 1.7 0 0 0 8.5 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 18.9 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1 .99Z" />
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5.5 7h13" />
      <path d="M9.5 4.5h5" />
      <path d="m8 7 .7 11h6.6L16 7" />
    </BaseIcon>
  );
}

export function ClaimIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 4.5h14v15H5z" />
      <path d="M8.5 9.5h7" />
      <path d="M8.5 13h4.5" />
      <path d="m14.5 16 1.5 1.5 3-3" />
    </BaseIcon>
  );
}
