"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Contact, Import, Loader2, Plus, Search } from "lucide-react";

import { ContactCard } from "@/src/components/contacts/contact-card";
import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { useToast } from "@/src/components/toast-provider";
import { apiPost } from "@/src/lib/api";
import {
  deleteTrustLinkContact,
  listTrustLinkContacts,
  saveTrustLinkContact,
} from "@/src/lib/contacts/contacts-api";
import {
  canPickDeviceContacts,
  pickDeviceContacts,
} from "@/src/lib/contacts/device-contact-picker";
import type { TrustLinkContact } from "@/src/lib/contacts/types";
import type { RecipientLookupResult } from "@/src/lib/types";
import { resolveTinFromChain } from "@/src/lib/tins";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

function normalizeTin(value: string) {
  const digits = value.trim().replace(/\D/g, "");
  return /^\d{10}$/.test(digits) ? digits : "";
}

export function ContactsExperience() {
  const {
    hydrated,
    accessToken,
    user,
    pendingAuth,
    completePendingAuth,
    logout,
  } = useAuthenticatedSession("/app/contacts");
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<TrustLinkContact[]>([]);
  const [query, setQuery] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [tin, setTin] = useState("");
  const [resolvedTin, setResolvedTin] = useState("");
  const [resolvingTin, setResolvingTin] = useState(false);
  const [tinLookupMessage, setTinLookupMessage] = useState<string | null>(null);
  const [resolvedPhoneAvailable, setResolvedPhoneAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(
    null,
  );
  const deviceImportAvailable = canPickDeviceContacts();

  useEffect(() => {
    if (!accessToken) return;

    const token = accessToken;
    let cancelled = false;

    async function loadContacts() {
      setLoading(true);

      try {
        const result = await listTrustLinkContacts(token);
        if (!cancelled) setContacts(result.contacts);
      } catch (error) {
        if (!cancelled) {
          showToast(
            error instanceof Error ? error.message : "Could not load contacts",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadContacts();
    return () => {
      cancelled = true;
    };
  }, [accessToken, showToast]);

  useEffect(() => {
    const digits = tin.replace(/\D/g, "").slice(0, 10);
    if (digits !== tin) setTin(digits);

    setResolvedTin("");
    setDisplayName("");
    setPhoneNumber("");
    setResolvedPhoneAvailable(false);
    if (digits.length !== 10) {
      setResolvingTin(false);
      setTinLookupMessage(digits ? "Enter all 10 TIN digits." : null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setResolvingTin(true);
      setTinLookupMessage("Finding this TIN...");
      try {
        const onchain = await resolveTinFromChain(digits);
        if (cancelled) return;
        if (!onchain.active) {
          throw new Error("This TIN exists, but it is not active.");
        }
        let indexed: RecipientLookupResult | null = null;
        try {
          indexed = await apiPost<RecipientLookupResult>(
            "/api/recipient/lookup",
            { tin: digits },
            accessToken ?? undefined,
            { cache: "default", ttlMs: 60_000 },
          );
        } catch {
          // A valid on-chain TIN remains saveable without platform enrichment.
        }
        if (cancelled) return;
        const indexedRecipient = indexed?.verified ? indexed.recipient : null;
        const resolvedPhone =
          onchain.whatsapp?.trim() || indexedRecipient?.phoneNumber?.trim() || "";
        const resolvedName =
          onchain.legalName ||
          onchain.name ||
          indexedRecipient?.displayName ||
          `TIN ${digits}`;
        setDisplayName(resolvedName);
        setPhoneNumber(resolvedPhone);
        setResolvedPhoneAvailable(Boolean(resolvedPhone));
        setResolvedTin(digits);
        setTinLookupMessage(
          resolvedPhone
            ? "TIN verified. Name and phone loaded automatically."
            : "TIN verified. No phone number is linked; you may add one.",
        );
      } catch (error) {
        if (cancelled) return;
        setTinLookupMessage(
          error instanceof Error ? error.message : "This TIN could not be verified.",
        );
      } finally {
        if (!cancelled) setResolvingTin(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tin, accessToken]);

  const filteredContacts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return contacts;

    return contacts.filter((contact) =>
      [
        contact.displayName,
        contact.phoneNumber,
        contact.tin,
        contact.trustlinkHandle,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(trimmed)),
    );
  }, [contacts, query]);

  async function handleSaveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    const normalizedTin = normalizeTin(tin);
    const normalizedPhone = phoneNumber.trim();

    if (!normalizedTin || resolvedTin !== normalizedTin || !displayName.trim()) {
      showToast("Enter a verified TIN before saving.");
      return;
    }

    setSaving(true);

    try {
      const result = await saveTrustLinkContact({
        accessToken,
        contact: {
          displayName: displayName.trim(),
          phoneNumber: normalizedPhone || null,
          tin: normalizedTin || null,
          source: normalizedTin ? "tin_lookup" : "manual",
        },
      });
      setContacts((current) => [
        result.contact,
        ...current.filter((contact) => contact.id !== result.contact.id),
      ]);
      setDisplayName("");
      setPhoneNumber("");
      setTin("");
      setResolvedTin("");
      setTinLookupMessage(null);
      showToast("Contact saved.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save contact");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportContacts() {
    if (!accessToken) return;

    setImporting(true);

    try {
      const selectedContacts = await pickDeviceContacts();
      const savedContacts: TrustLinkContact[] = [];

      for (const selectedContact of selectedContacts) {
        const result = await saveTrustLinkContact({
          accessToken,
          contact: {
            displayName: selectedContact.displayName,
            phoneNumber: selectedContact.phoneNumber,
            source: "device_import",
          },
        });
        savedContacts.push(result.contact);
      }

      setContacts((current) => [
        ...savedContacts,
        ...current.filter(
          (contact) =>
            !savedContacts.some((savedContact) => savedContact.id === contact.id),
        ),
      ]);
      showToast(
        savedContacts.length === 1
          ? "Imported 1 contact."
          : `Imported ${savedContacts.length} contacts.`,
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not import contacts",
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteContact(contactId: string) {
    if (!accessToken) return;

    setDeletingContactId(contactId);

    try {
      await deleteTrustLinkContact({ accessToken, contactId });
      setContacts((current) =>
        current.filter((contact) => contact.id !== contactId),
      );
      showToast("Contact deleted.");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not delete contact",
      );
    } finally {
      setDeletingContactId(null);
    }
  }

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell
      currentTab="contacts"
      title="Contacts"
      subtitle="Save trusted recipients so future TIN payments are faster and safer."
      user={user}
      showBackButton
      backHref="/app"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal
            pendingAuth={pendingAuth}
            user={user}
            onAuthenticated={completePendingAuth}
            onSignOut={logout}
          />
        ) : null
      }
    >
      <section className="mx-auto w-full max-w-[980px] space-y-5">
        <div className="tl-panel rounded-[28px] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-accent-border bg-accent-soft text-accent">
                <Contact size={18} />
              </div>
              <h2 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-text">
                Trusted recipients
              </h2>
              <p className="mt-1 max-w-[560px] text-sm leading-relaxed text-text-soft">
                Save TINs and selected phone contacts you approve. TrustLink never imports the full address book silently.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleImportContacts()}
              disabled={!deviceImportAvailable || importing}
              className="tl-field-btn inline-flex items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Import size={16} />
              )}
              <span>
                {deviceImportAvailable
                  ? importing
                    ? "Importing..."
                    : "Import from device"
                  : "Device import unavailable"}
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <form
            onSubmit={handleSaveContact}
            className="tl-panel tl-field rounded-[24px] p-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <Plus size={17} className="text-accent" />
              <h3 className="text-sm font-semibold text-text">Save contact</h3>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="tl-text-muted mb-1 block text-[0.68rem]">
                  TIN
                </span>
                <input
                  value={tin}
                  onChange={(event) => setTin(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  maxLength={14}
                  className="tl-field w-full rounded-[16px] px-3 py-3 text-sm outline-none"
                  placeholder="10-digit TIN"
                />
                {tinLookupMessage ? (
                  <span className={`mt-1.5 block text-[0.66rem] ${resolvedTin ? "text-accent" : "text-text-faint"}`}>
                    {tinLookupMessage}
                  </span>
                ) : null}
              </label>
              <label className="block">
                <span className="tl-text-muted mb-1 block text-[0.68rem]">
                  Name
                </span>
                <input
                  value={displayName}
                  readOnly
                  required
                  maxLength={80}
                  className="tl-field w-full rounded-[16px] px-3 py-3 text-sm outline-none read-only:cursor-default read-only:opacity-80"
                  placeholder={resolvingTin ? "Finding name..." : "Loaded from TIN"}
                />
              </label>
              <label className="block">
                <span className="tl-text-muted mb-1 block text-[0.68rem]">
                  Phone
                </span>
                <input
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  readOnly={resolvedPhoneAvailable}
                  inputMode="tel"
                  className="tl-field w-full rounded-[16px] px-3 py-3 text-sm outline-none"
                  placeholder={resolvedTin ? "No phone number — optional" : "Loaded from TIN"}
                />
              </label>
              <button
                type="submit"
                disabled={saving || resolvingTin || resolvedTin !== normalizeTin(tin)}
                className="tl-button-primary w-full rounded-[18px] px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save contact"}
              </button>
            </div>
          </form>

          <div className="space-y-4">
            <div className="tl-panel tl-field flex items-center gap-3 rounded-[20px] px-4 py-3">
              <Search size={16} className="text-text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-faint"
                placeholder="Search saved contacts"
              />
            </div>

            {loading ? (
              <div className="tl-panel tl-field rounded-[22px] px-5 py-8 text-center text-sm text-text-soft">
                Loading contacts...
              </div>
            ) : filteredContacts.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredContacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    deleting={deletingContactId === contact.id}
                    onDelete={(contactId) => {
                      void handleDeleteContact(contactId);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="tl-panel tl-field rounded-[22px] px-5 py-8 text-center">
                <div className="text-sm font-semibold text-text">
                  No contacts yet
                </div>
                <p className="mx-auto mt-1 max-w-[360px] text-sm text-text-soft">
                  Save a TIN manually, import selected device contacts, or save a recipient after a payment.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </AppMobileShell>
  );
}
