"use client";

import { useEffect, useState } from "react";
import { shortenAddress } from "@/src/lib/address";
import { buildBackendUrl } from "@/src/lib/backend";

type IdentityTreeProps = {
  displayName: string;
  nameSourceLabel?: string | null;
  missingTinName?: boolean;
  tinName?: string | null;
  tinNameVerified?: boolean;
  handle?: string | null;
  trustLinkDisplayName?: string | null;
  tin?: string | null;
  tinsIdentityPublicKey?: string | null;
  phoneNumber?: string | null;
  whatsappDisplayName?: string | null;
  whatsappProfilePic?: string | null;
  whatsappBusiness?: boolean;
  walletLabel?: string | null;
  compact?: boolean;
  hideMissingNodes?: boolean;
};

type IdentityNode = {
  label: string;
  value: string;
  tone?: "accent" | "muted";
};

export function IdentityTree({
  displayName,
  nameSourceLabel,
  missingTinName = false,
  tinName,
  tinNameVerified = false,
  handle,
  trustLinkDisplayName,
  tin,
  tinsIdentityPublicKey,
  phoneNumber,
  whatsappDisplayName,
  whatsappProfilePic,
  whatsappBusiness = false,
  walletLabel,
  compact = false,
  hideMissingNodes = false,
}: IdentityTreeProps) {
  const [avatarBroken, setAvatarBroken] = useState(false);
  const hasWhatsAppIdentity = Boolean(phoneNumber);
  const avatarSrc = whatsappProfilePic
    ? `${buildBackendUrl("/api/whatsapp/avatar")}?url=${encodeURIComponent(whatsappProfilePic)}`
    : null;
  useEffect(() => setAvatarBroken(false), [avatarSrc]);
  const tinValue = tin
    ? `${tin} · ${
        tinName?.trim()
          ? `${tinName.trim()}${tinNameVerified ? " · Verified" : ""}`
          : "No verified legal name"
      }`
    : null;
  const nodes: IdentityNode[] = [
    tinValue
      ? { label: "Transfer Identity Number", value: tinValue, tone: "accent" }
      : hideMissingNodes
        ? null
        : {
            label: "Transfer Identity Number",
            value: "Not linked",
            tone: "muted",
          },
    tinsIdentityPublicKey
      ? {
          label: "TINS identity PDA",
          value: shortenAddress(tinsIdentityPublicKey),
        }
      : hideMissingNodes
        ? null
        : {
            label: "TINS identity PDA",
            value: "Not available",
            tone: "muted",
          },
    handle
      ? {
          label: "TrustLink handle",
          value: `@${handle}${
            trustLinkDisplayName?.trim()
              ? ` · ${trustLinkDisplayName.trim()}`
              : ""
          }`,
        }
      : null,
    phoneNumber
      ? {
          label: "WhatsApp identity",
          value: `${phoneNumber} · ${
            whatsappDisplayName?.trim()
              ? whatsappDisplayName.trim()
              : whatsappBusiness
                ? "Business account"
                : "Personal account"
          }`,
        }
      : null,
    walletLabel ? { label: "Settlement wallet", value: walletLabel } : null,
  ].filter((node): node is IdentityNode => Boolean(node));

  return (
    <div
      className={`rounded-[18px] border border-[var(--field-border)] bg-[var(--field)] ${
        compact ? "px-3 py-3" : "px-4 py-4"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-[14px] border text-[0.78rem] font-black ${
            hasWhatsAppIdentity
              ? "border-[#25D366]/25 bg-[#25D366]/12 "
              : "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
          }`}
        >
          {avatarSrc && !avatarBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={whatsappDisplayName || "WhatsApp profile"}
              className="h-full w-full rounded-[13px] object-cover"
              onError={() => setAvatarBroken(true)}
            />
          ) : hasWhatsAppIdentity ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          ) : (
            displayName.trim().slice(0, 1).toUpperCase() || "T"
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[0.86rem] font-semibold text-[var(--text)]">
            {displayName}
          </div>
          <div className="text-[0.64rem] text-[var(--text-faint)]">
            {nameSourceLabel ??
              "One identity root mapped across TrustLink and TINS"}
          </div>
        </div>
      </div>

      {missingTinName ? (
        <div className="mt-3 rounded-[14px] border border-[#f3c96b]/25 bg-[#f3c96b]/10 px-3 py-2 text-[0.72rem] leading-relaxed text-[#f3c96b]">
          No verified legal name was found on this transfer identity number.
        </div>
      ) : null}

      <div className="relative mt-4 space-y-2 pl-4">
        <div className="absolute bottom-4 left-[5px] top-1 w-px bg-[var(--field-border)]" />
        {nodes.map((node) => (
          <div
            key={`${node.label}:${node.value}`}
            className="relative flex items-center gap-3"
          >
            <span className="absolute left-[-14px] h-px w-3 bg-[var(--field-border)]" />
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                node.tone === "accent"
                  ? "bg-[var(--accent)]"
                  : node.tone === "muted"
                    ? "bg-[var(--text-faint)]"
                    : "bg-[var(--primary-accent)]"
              }`}
            />
            <div className="min-w-0 flex-1 rounded-[12px] border border-white/5 bg-white/[0.02] px-3 py-2">
              <div className="text-[0.58rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">
                {node.label}
              </div>
              <div className="mt-0.5 truncate text-[0.76rem] font-semibold text-[var(--text-soft)]">
                {node.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
