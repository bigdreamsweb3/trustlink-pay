"use client";

type SuccessIconProps = {
  className?: string;
};

export function SuccessIcon({ className = "h-14 w-14" }: SuccessIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/checked-success.svg"
      alt=""
      aria-hidden="true"
      className={className}
    />
  );
}
