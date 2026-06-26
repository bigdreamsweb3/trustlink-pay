"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  Fingerprint,
  Link2,
  ShieldCheck,
  Smartphone,
  WalletCards,
} from "lucide-react";

import { IdentityTree } from "@/src/components/identity-tree";
import { SectionLoader } from "@/src/components/section-loader";
import { useToast } from "@/src/components/toast-provider";
import { shortenAddress } from "@/src/lib/address";
import { apiGet, apiPost } from "@/src/lib/api";
import { setStoredUser } from "@/src/lib/storage";
import {
  createOrLoadTinForWallet,
  resolveTinFromChain,
  upgradeLegacyTinForWallet,
  type BrowserResolvedTin,
} from "@/src/lib/tins";
import type {
  IdentitySecurityResponse,
  TinIdentityState,
  UserProfile,
  WhatsAppNumberVerificationResult,
} from "@/src/lib/types";
import { useWallet } from "@/src/lib/wallet-provider";

function extractTinInfo(
  result: IdentitySecurityResponse | null,
): TinIdentityState | null {
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

export function IdentityOverviewSection({
  accessToken,
  user,
  setUser,
}: {
  accessToken: string | null;
  user: UserProfile;
  setUser: (user: UserProfile) => void;
}) {
  const { showToast } = useToast();
  const { session, walletAddress, requestWalletConnection } = useWallet();
  const [identityResponse, setIdentityResponse] =
    useState<IdentitySecurityResponse | null>(null);
  const [resolvedTin, setResolvedTin] = useState<BrowserResolvedTin | null>(
    null,
  );
  const [whatsappProfile, setWhatsappProfile] =
    useState<WhatsAppNumberVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tinInfo = extractTinInfo(identityResponse);
  const activeTin = tinInfo?.tin ?? user.tin ?? null;
  const activeTinIdentity =
    tinInfo?.tinsIdentityPublicKey ?? user.tinsIdentityPublicKey ?? null;

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    apiGet<IdentitySecurityResponse>("/api/identity", accessToken)
      .then((result) => {
        if (!cancelled) {
          setIdentityResponse(result);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load identity",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!activeTin) {
      setResolvedTin(null);
      return;
    }
    let cancelled = false;
    resolveTinFromChain(activeTin)
      .then((identity) => {
        if (!cancelled) setResolvedTin(identity);
      })
      .catch(() => {
        if (!cancelled) setResolvedTin(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTin]);

  useEffect(() => {
    if (!user.phoneNumber) return;
    let cancelled = false;
    apiPost<WhatsAppNumberVerificationResult>(
      "/api/whatsapp/verify-number",
      { phoneNumber: user.phoneNumber },
      undefined,
      { cache: "default", ttlMs: 5 * 60_000 },
    )
      .then((profile) => {
        if (!cancelled) setWhatsappProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setWhatsappProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user.phoneNumber]);

  const sasAttestations = useMemo(
    () =>
      resolvedTin?.socialIdentities.filter((identity) =>
        identity.type.toLowerCase().startsWith("sas"),
      ) ?? [],
    [resolvedTin?.socialIdentities],
  );

  async function handleCreateTin() {
    if (!accessToken) return;
    if (!walletAddress || !session) {
      requestWalletConnection();
      showToast("Connect the wallet that will own the TIN intent.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const tin = await createOrLoadTinForWallet({
        walletId: session.walletId,
        walletAddress,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
      });
      const stored = await apiPost<TinIdentityState>(
        "/api/identity/tin",
        tin,
        accessToken,
      );
      setIdentityResponse((current) =>
        current
          ? { ...current, ...stored }
          : ({ ...stored, identity: null } as IdentitySecurityResponse),
      );
      const nextUser: UserProfile = {
        ...user,
        tin: stored.tin,
        tinsIdentityPublicKey: stored.tinsIdentityPublicKey,
        tinsRegistryPublicKey: stored.tinsRegistryPublicKey,
        tinsWalletPublicKey: stored.tinsWalletPublicKey,
        tinsProgramId: stored.tinsProgramId,
        tinsCreatedAt: stored.tinsCreatedAt,
      };
      setUser(nextUser);
      setStoredUser(nextUser);
      showToast(
        tin.created
          ? `TIN ${tin.tin} created.`
          : `TIN ${tin.tin} is linked to this wallet.`,
      );
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Could not create TIN";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyTin() {
    if (!activeTin || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(activeTin);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  async function handleUpgradeTin() {
    if (!accessToken || !activeTin || !resolvedTin?.upgradeRequired) return;
    if (!walletAddress || !session) {
      requestWalletConnection();
      showToast("Connect the wallet that owns this TIN before upgrading.");
      return;
    }

    setUpgradeBusy(true);
    setError(null);
    try {
      const upgraded = await upgradeLegacyTinForWallet({
        walletId: session.walletId,
        walletAddress,
        tin: activeTin,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        legacyAccountPublicKey: resolvedTin.registry,
      });
      const stored = await apiPost<TinIdentityState>(
        "/api/identity/tin",
        upgraded,
        accessToken,
      );
      setIdentityResponse((current) =>
        current
          ? { ...current, ...stored }
          : ({ ...stored, identity: null } as IdentitySecurityResponse),
      );
      const nextUser: UserProfile = {
        ...user,
        tin: stored.tin,
        tinsIdentityPublicKey: stored.tinsIdentityPublicKey,
        tinsRegistryPublicKey: stored.tinsRegistryPublicKey,
        tinsWalletPublicKey: stored.tinsWalletPublicKey,
        tinsProgramId: stored.tinsProgramId,
        tinsCreatedAt: stored.tinsCreatedAt,
      };
      setUser(nextUser);
      setStoredUser(nextUser);
      setResolvedTin(await resolveTinFromChain(activeTin));
      showToast(`TIN upgraded. Seed backup downloaded as ${upgraded.seedBackupFileName}.`);
    } catch (upgradeError) {
      const message =
        upgradeError instanceof Error
          ? upgradeError.message
          : "Could not upgrade TIN";
      setError(message);
      showToast(message);
    } finally {
      setUpgradeBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="tl-panel rounded-[28px] p-5">
        <SectionLoader label="Loading your identity..." />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-[18px] border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 px-4 py-3 text-[0.76rem] text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="tl-panel rounded-[28px] p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[1rem] font-semibold text-[var(--text)]">
                Identity map
              </h3>
              <p className="mt-1 text-[0.74rem] text-[var(--text-soft)]">
                One identity root across TINS, TrustLink and verified social
                channels.
              </p>
            </div>
            {activeTin ? (
              <button
                type="button"
                onClick={() => void handleCopyTin()}
                className="tl-button-secondary grid h-9 w-9 shrink-0 place-items-center rounded-full"
                aria-label="Copy TIN"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            ) : null}
          </div>

          {activeTin && resolvedTin?.upgradeRequired ? (
            <div className="mb-4 rounded-[18px] border border-accent-border bg-accent-soft/60 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8rem] font-semibold text-[var(--text)]">
                    Legacy TIN upgrade required
                  </p>
                  <p className="mt-1 text-[0.74rem] leading-6 text-[var(--text-soft)]">
                    {resolvedTin.upgradeReason ??
                      "This TIN still uses the old layout. Upgrade it now so the network can attach the 30-PRU settlement commitment."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleUpgradeTin()}
                    disabled={upgradeBusy}
                    className="tl-button-primary mt-3 inline-flex items-center justify-center gap-2 rounded-[14px] px-3.5 py-2.5 text-[0.74rem] font-semibold disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {upgradeBusy ? "Upgrading TIN..." : "Upgrade TIN now"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <IdentityTree
            displayName={
              resolvedTin?.legalName ||
              whatsappProfile?.displayName ||
              user.displayName
            }
            nameSourceLabel={
              resolvedTin?.legalName
                ? "Verified TIN legal name"
                : whatsappProfile?.displayName
                  ? "WhatsApp public display name"
                  : "TrustLink display name"
            }
            tin={activeTin}
            tinName={resolvedTin?.legalName}
            tinNameVerified={Boolean(resolvedTin?.legalName)}
            missingTinName={Boolean(
              activeTin && resolvedTin && !resolvedTin.legalName,
            )}
            tinsIdentityPublicKey={activeTinIdentity}
            handle={user.handle}
            trustLinkDisplayName={user.displayName}
            phoneNumber={user.phoneNumber}
            whatsappDisplayName={whatsappProfile?.displayName}
            whatsappProfilePic={
              whatsappProfile?.hasProfilePic
                ? whatsappProfile.profilePic
                : null
            }
            whatsappBusiness={whatsappProfile?.isBusiness ?? false}
            walletLabel={
              identityResponse?.identity?.mainWallet
                ? shortenAddress(identityResponse.identity.mainWallet)
                : undefined
            }
          />

          {!activeTin ? (
            <button
              type="button"
              onClick={() => void handleCreateTin()}
              disabled={busy}
              className="tl-button-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[18px] px-4 py-3.5 text-[0.82rem] font-semibold disabled:opacity-50"
            >
              <Fingerprint className="h-4 w-4" />
              {busy
                ? "Creating identity..."
                : walletAddress
                  ? "Queue TIN creation"
                  : "Connect wallet to queue TIN"}
            </button>
          ) : null}
        </div>

        <div className="space-y-3">
          <StatusCard
            icon={Fingerprint}
            title="Transfer Identity Number"
            value={activeTin ? `TIN ${activeTin}` : "Not created"}
            status={activeTin ? "Active" : "Action required"}
            active={Boolean(activeTin)}
          />
          <StatusCard
            icon={Smartphone}
            title="WhatsApp authentication"
            value={
              whatsappProfile?.displayName ||
              user.phoneNumber ||
              "Not connected"
            }
            status={user.phoneVerifiedAt ? "Verified" : "Not verified"}
            active={Boolean(user.phoneVerifiedAt)}
          />
          <StatusCard
            icon={ShieldCheck}
            title="SAS attestations"
            value={
              sasAttestations.length > 0
                ? `${sasAttestations.length} active`
                : "No attestations"
            }
            status={
              sasAttestations.length > 0 ? "Verified" : "Not available yet"
            }
            active={sasAttestations.length > 0}
          />
          <StatusCard
            icon={WalletCards}
            title="Settlement authority"
            value={
              identityResponse?.identity?.mainWallet
                ? shortenAddress(identityResponse.identity.mainWallet)
                : activeTin
                  ? "Awaiting wallet binding"
                  : "Not configured"
            }
            status={
              resolvedTin?.settlementAuthorityVerified
                ? "On-chain verified"
                : "Not verified"
            }
            active={Boolean(resolvedTin?.settlementAuthorityVerified)}
          />
        </div>
      </div>
    </section>
  );
}

function StatusCard({
  icon: Icon,
  title,
  value,
  status,
  active,
}: {
  icon: typeof Link2;
  title: string;
  value: string;
  status: string;
  active: boolean;
}) {
  return (
    <div className="tl-panel flex items-center gap-3 rounded-[20px] p-4">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border ${
          active
            ? "border-accent-border bg-accent-soft text-accent"
            : "border-[var(--field-border)] bg-[var(--surface-soft)] text-[var(--text-faint)]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[var(--text-faint)]">
          {title}
        </span>
        <span className="mt-1 block truncate text-[0.78rem] font-semibold text-[var(--text)]">
          {value}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-1 text-[0.58rem] font-medium ${
          active
            ? "bg-accent-soft text-accent"
            : "bg-[var(--surface-soft)] text-[var(--text-faint)]"
        }`}
      >
        {status}
      </span>
    </div>
  );
}
