"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IdentityTree } from "@/src/components/identity-tree";
import { AppSidePanel } from "@/src/components/panels/app-side-panel";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { createOrLoadTinForWallet } from "@/src/lib/tins";
import type { IdentitySecurityResponse, IdentitySecurityState, TinIdentityState } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import { useWallet } from "@/src/lib/wallet-provider";
import { ChevronRight, Settings } from "lucide-react";

/* ── WhatsApp icon ── */
function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function extractTinInfo(result: IdentitySecurityResponse | null): TinIdentityState | null {
  if (!result?.tin) return null;
  return {
    tin: result.tin,
    tinsIdentityPublicKey: result.tinsIdentityPublicKey ?? null,
    tinsRegistryPublicKey: result.tinsRegistryPublicKey ?? null,
    tinsWalletPublicKey: result.tinsWalletPublicKey ?? null,
    tinsProgramId: result.tinsProgramId ?? null,
    tinsCreatedAt: result.tinsCreatedAt ?? null,
  };
}

export function IdentitySheetModal({
  open,
  desktopInline = false,
  onClose,
}: {
  open: boolean;
  desktopInline?: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const { accessToken, user } = useAuthenticatedSession("/app");
  const { session, walletAddress, requestWalletConnection } = useWallet();

  const [identitySecurity, setIdentitySecurity] = useState<IdentitySecurityState | null>(null);
  const [tinInfo, setTinInfo] = useState<TinIdentityState | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityBusy, setIdentityBusy] = useState(false);

  useEffect(() => {
    if (!open || !accessToken) return;
    void loadIdentitySecurity(accessToken);
  }, [open, accessToken]);

  async function loadIdentitySecurity(token: string) {
    setIdentityLoading(true);
    try {
      const result = await apiGet<IdentitySecurityResponse>("/api/identity", token);
      setIdentitySecurity(result.identity);
      setTinInfo(extractTinInfo(result));
    } catch (e) {
      // Ignore errors silently for now, as in dashboard
    } finally {
      setIdentityLoading(false);
    }
  }

  async function handleBindMainWallet() {
    if (!accessToken || !user) return;
    if (!walletAddress || !session) {
      requestWalletConnection();
      showToast("Connect the wallet you want to register with TINS.");
      return;
    }
    setIdentityBusy(true);
    try {
      showToast("Checking your TINS identity.");
      const tin = await createOrLoadTinForWallet({
        walletId: session.walletId,
        walletAddress,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
      });
      const stored = await apiPost<TinIdentityState>("/api/identity/tin", tin, accessToken);
      setTinInfo(stored);
      await loadIdentitySecurity(accessToken);
      showToast(tin.created ? `TIN ${tin.tin} created.` : `TIN ${tin.tin} is already linked to this wallet.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create TINS identity";
      showToast(message);
    } finally {
      setIdentityBusy(false);
    }
  }

  const activeTin = tinInfo?.tin ?? user?.tin ?? null;
  const activeTinIdentity = tinInfo?.tinsIdentityPublicKey ?? user?.tinsIdentityPublicKey ?? null;
  const displayName = user?.displayName ?? "TrustLink User";

  async function handleCopyTinNumber() {
    if (!activeTin || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(activeTin);
    showToast("TIN copied.");
  }

  return (
    <AppSidePanel
      open={open}
      title="Identity"
      kicker="Manage Identity"
      desktopInline={desktopInline}
      onClose={onClose}
    >
      <div className="flex h-full flex-col">
        {identityLoading && !tinInfo ? (
          <div className="py-8 text-center text-[0.82rem] text-[var(--muted)]">
            Loading identity...
          </div>
        ) : (

          <div className="">
            <div className="flex items-start justify-between mb-3">
              <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]"></div>
              <Link href="/app/settings" onClick={onClose} className="text-[0.62rem] font-medium text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors">
                <Settings className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* ═══════════ Stats Card ═══════════ */}
            <div className="space-y-3 mb-3">
              <div className="tl-panel-header tl-field rounded-[22px]">
                <div className="px-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-text-soft">Trust Score</div>
                    <Link
                      href="/app/profile"
                      className="flex items-center gap-1.5 text-[0.76rem] font-semibold text-[var(--accent-deep)] dark:text-[var(--accent)] transition-colors hover:opacity-80 cursor-pointer"
                    >
                      Profile
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <div className="mt-3 text-[1.5rem] font-bold tracking-tight text-(--text)">0.00</div>
                  <div className="mt-2 h-1 w-10 rounded-full bg-accent-deep dark:bg-accent" />
                </div>
              </div>
            </div>


            <div className="tl-text-muted mb-3 text-[0.62rem] uppercase tracking-[0.2em]">Registered Identities</div>

            <div className="space-y-3">
              <IdentityTree
                displayName={displayName}
                nameSourceLabel={activeTin ? "Transfer identity name" : "TrustLink display name"}
                handle={user?.handle}
                tin={activeTin}
                tinsIdentityPublicKey={activeTinIdentity}
                phoneNumber={user?.phoneNumber}
              />

              {/* TIN Card */}
              <button
                type="button"
                onClick={() => activeTin ? void handleCopyTinNumber() : void handleBindMainWallet()}
                disabled={identityBusy}
                className="flex w-full items-center gap-3 rounded-[16px] border border-[var(--field-border)] bg-[var(--field)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`h-4 w-4 shrink-0 ${activeTin ? "text-[var(--accent)]" : "text-[#ffb86b]"}`}
                >
                  <circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 14.14 14.14" /><path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.82rem] font-semibold">
                    {activeTin ? displayName : identityBusy ? "Creating TIN..." : "Create TIN"}
                    <span className="ml-1.5 text-[0.58rem] font-normal opacity-60">Transfer Identity Number</span>
                  </div>
                  <div className="text-[0.66rem] text-[var(--text-faint)] mt-0.5">
                    {activeTin
                      ? `TIN ${activeTin}${activeTinIdentity ? ` - ${shortenAddress(activeTinIdentity)}` : ""}`
                      : "Create on-chain payment identity - TINS Protocol"}
                  </div>
                </div>
                <span className="shrink-0 flex items-center gap-1 text-[0.62rem] font-medium rounded-full px-2 py-0.5"
                  style={activeTin ? { background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent)" } : { border: "1px solid var(--field-border)", color: "var(--text-faint)" }}
                >
                  {activeTin ? "Active" : identityBusy ? "Working" : "Create"}
                </span>
              </button>

              {/* WhatsApp Card */}
              {user?.phoneNumber && (
                <div className="flex items-center gap-3 rounded-[16px] border border-[var(--field-border)] bg-[var(--field)] px-4 py-3.5">
                  <WhatsAppIcon className="h-4 w-4 text-[#25D366] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.82rem] font-semibold truncate text-[var(--text)]">
                      {user.phoneNumber}
                    </div>
                    <div className="text-[0.66rem] mt-0.5 text-[var(--text-faint)]">
                      WhatsApp - TrustLink login
                    </div>
                  </div>
                  <span className="shrink-0 text-[0.62rem] font-medium rounded-full px-2 py-0.5"
                    style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}
                  >
                    Active
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppSidePanel>
  );
}
