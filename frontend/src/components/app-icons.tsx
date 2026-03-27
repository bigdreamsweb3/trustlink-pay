import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </BaseIcon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 12h12" />
      <path d="M12 6l6 6-6 6" />
      <path d="M5.5 6.5h4" />
    </BaseIcon>
  );
}

export function ReceiveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 12H8" />
      <path d="M12 18l-6-6 6-6" />
      <path d="M14.5 17.5h4" />
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
      <path d="M4.5 8.5A2.5 2.5 0 0 1 7 6h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 18H7a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M15.5 12h4" />
      <circle cx="15.25" cy="12" r="0.75" fill="currentColor" stroke="none" />
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
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.4" />
      <path d="M12 3a9 9 0 0 1 8.4 5.75" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M15 18l-6-6 6-6" />
      <path d="M10 12h8" />
    </BaseIcon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </BaseIcon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 3l18 18" />
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

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="2.75" />
      <path d="M12 3.75v2.1" />
      <path d="M12 18.15v2.1" />
      <path d="M20.25 12h-2.1" />
      <path d="M5.85 12h-2.1" />
      <path d="M17.83 6.17l-1.48 1.48" />
      <path d="M7.65 16.35l-1.48 1.48" />
      <path d="M17.83 17.83l-1.48-1.48" />
      <path d="M7.65 7.65L6.17 6.17" />
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5.5 7h13" />
      <path d="M9.5 4.5h5" />
      <path d="M8 7l.7 11h6.6L16 7" />
    </BaseIcon>
  );
}

export function ClaimIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4.5v9" />
      <path d="M8.5 10.5 12 14l3.5-3.5" />
      <path d="M5 17.5h14" />
    </BaseIcon>
  );
}
