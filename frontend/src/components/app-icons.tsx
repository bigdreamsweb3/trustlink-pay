import Image from "next/image";
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { children?: ReactNode };

type AppIconProps = {
  children?: ReactNode;
  className?: string;
  plain?: boolean;
  size?: number;
} & React.HTMLAttributes<HTMLDivElement>;

function AppIcon({ children, className = "", size = 24, ...props }: AppIconProps) {
  return (
    <div
      className={`bg-accent-icon inline-flex items-center justify-center rounded-md border border-accent/5 p-[1px]  text-[#203236] shadow-soft transition ${className}`}
      {...props}
    >
      <div style={{ width: size, height: size }} className="inline-flex items-center justify-center">
        {children}
      </div>
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

export function HomeIcon(props?: AppIconProps) {
  return (
    <AppIcon {...props}>
      <Image
        src="/icons/tlp/home.png"
        alt="home icon"
        width={24}
        height={24}
      />
    </AppIcon>
  );
}

export function SendIcon(props?: AppIconProps) {
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

export function ReceiveIcon(props?: AppIconProps) {
  return (
    <AppIcon {...props}>
      <Image
        src="/icons/tlp/receive.png"
        alt="receive icon"
        width={24}
        height={24}
      />
    </AppIcon>
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

export function WalletIcon(props?: AppIconProps) {
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

export function CopyIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="9" y="9" width="9" height="9" rx="2" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
    </BaseIcon>
  );
}

export function SettingsIcon(props?: AppIconProps) {
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

export function ClaimIcon(props?: AppIconProps) {
  return (
    <AppIcon {...props}>
      <Image
        src="/icons/tlp/claim.png"
        alt="settings icon"
        width={24}
        height={24}
      />
    </AppIcon>
  );
}
