import Image from "next/image";
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { children?: ReactNode };

type AppIconProps = { children?: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>;

function AppIcon({ children, className = "", ...props }: AppIconProps) {
  return (
    <div
      className={`h-fit w-fit rounded-md border border-white/10 bg-[#76ffd8] text-white/72 shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition hover:border-white/16 hover:bg-white/[0.05] hover:text-white inline-flex items-center justify-center ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

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

export function SendIcon(props?: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <AppIcon {...props}>
      <Image
        src="/icons/tlp/send.png"
        alt="send icon"
        width={24}
        height={24}
      />
    </AppIcon>
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

export function WalletIcon(props?: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <AppIcon {...props}>
      <Image
        src="/icons/tlp/wallet.png"
        alt="settings icon"
        width={24}
        height={24}
      />
    </AppIcon>
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

export function SettingsIcon(props?: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <AppIcon {...props}>
      <Image
        src="/icons/tlp/setting.png"
        alt="settings icon"
        width={24}
        height={24}
      />
    </AppIcon>
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
