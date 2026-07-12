"use client";

import { Trash2 } from "lucide-react";

import { contactSourceLabel } from "@/src/components/contacts/contact-source-label";
import type { TrustLinkContact } from "@/src/lib/contacts/types";

type ContactCardProps = {
  contact: TrustLinkContact;
  deleting?: boolean;
  onDelete: (contactId: string) => void;
};

export function ContactCard({
  contact,
  deleting = false,
  onDelete,
}: ContactCardProps) {
  const route = contact.tin ?? contact.phoneNumber ?? "";

  return (
    <div className="tl-panel tl-field rounded-[22px] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">
            {contact.displayName}
          </div>
          <div className="tl-text-muted mt-1 text-[0.72rem]">
            {contact.tin ? `TIN ${contact.tin}` : contact.phoneNumber}
          </div>
          {contact.tin && contact.phoneNumber ? (
            <div className="tl-text-muted mt-0.5 text-[0.68rem]">
              {contact.phoneNumber}
            </div>
          ) : null}
          {contact.trustlinkHandle ? (
            <div className="tl-text-muted mt-0.5 text-[0.68rem]">
              @{contact.trustlinkHandle}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDelete(contact.id)}
          disabled={deleting}
          className="tl-field-btn grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={`Delete ${contact.displayName}`}
        >
          <Trash2 size={15} className="text-current" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--field-border)] pt-3">
        <span className="tl-text-muted text-[0.68rem]">
          {contactSourceLabel(contact.source)}
        </span>
        <span className="truncate text-[0.68rem] font-medium text-text">
          {route}
        </span>
      </div>
    </div>
  );
}
