"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Calculator, Info, TrendingUp } from "lucide-react";

const BASE_DEFI_APY = 10.2;
const SENDER_FEE_RATE = 0.001;
const CLAIM_FEE_RATE = 0.001;
const SENDER_POOL_SHARE = 0.8;
const SENDER_TSN_SHARE = 0.2;
const CLAIM_OPERATOR_SHARE = 0.35;
const CLAIM_POOL_SHARE = 0.65;
const NETWORK_FEE_USD = 0.003;
const EPOCH_HOURS = 7;

const SOLANA_PROTOCOLS = [
  { name: "Kamino Finance", apy: 10.5, color: "#6aa7ff" },
  { name: "Drift Protocol", apy: 9.2, color: "#35d39d" },
  { name: "Jito / jitoSOL", apy: 8.1, color: "#f06ab7" },
  { name: "Marginfi", apy: 7.8, color: "#a982ff" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 4,
  }).format(value);
}

function compactMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return money(value);
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function LandingFeeYieldCalculator() {
  const [transferAmount, setTransferAmount] = useState(100);
  const [vaultDeposit, setVaultDeposit] = useState(50_000);
  const [dailyVolume, setDailyVolume] = useState(100_000);
  const [activeVaultLiquidity, setActiveVaultLiquidity] = useState(1_000_000);
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  const model = useMemo(() => {
    const epochsPerDay = 24 / EPOCH_HOURS;
    const vaultShare = activeVaultLiquidity > 0 ? Math.min(vaultDeposit / activeVaultLiquidity, 1) : 1;
    const assignedDailyVolume = dailyVolume * vaultShare;
    const vaultDailyCapacity = vaultDeposit * epochsPerDay;
    const settledDailyVolume = Math.min(assignedDailyVolume, vaultDailyCapacity);
    const senderFee = transferAmount * SENDER_FEE_RATE;
    const claimFee = transferAmount * CLAIM_FEE_RATE;
    const senderPoolAmount = senderFee * SENDER_POOL_SHARE;
    const senderTsnAmount = senderFee * SENDER_TSN_SHARE;
    const claimOperatorAmount = claimFee * CLAIM_OPERATOR_SHARE;
    const claimPoolAmount = claimFee * CLAIM_POOL_SHARE;
    const recipientReceives = Math.max(transferAmount - claimFee, 0);

    const annualDefiYield = vaultDeposit * (BASE_DEFI_APY / 100);
    const annualSenderPoolYield = settledDailyVolume * SENDER_FEE_RATE * SENDER_POOL_SHARE * 365;
    const annualClaimPoolYield = settledDailyVolume * CLAIM_FEE_RATE * CLAIM_POOL_SHARE * 365;
    const annualTotalPoolFeeYield = annualSenderPoolYield + annualClaimPoolYield;
    const annualOperatorYield = settledDailyVolume * CLAIM_FEE_RATE * CLAIM_OPERATOR_SHARE * 365;
    const annualTsnRevenue = settledDailyVolume * SENDER_FEE_RATE * SENDER_TSN_SHARE * 365;
    const annualGrossFeeRevenue = settledDailyVolume * (SENDER_FEE_RATE + CLAIM_FEE_RATE) * 365;
    const annualPoolIncome = annualDefiYield + annualTotalPoolFeeYield;
    const lpExpectedApy = vaultDeposit > 0 ? (annualPoolIncome / vaultDeposit) * 100 : 0;
    const grossFeeApy = vaultDeposit > 0 ? (annualGrossFeeRevenue / vaultDeposit) * 100 : 0;
    const lpFeeApy = vaultDeposit > 0 ? (annualTotalPoolFeeYield / vaultDeposit) * 100 : 0;

    return {
      senderFee,
      claimFee,
      senderPoolAmount,
      senderTsnAmount,
      claimOperatorAmount,
      claimPoolAmount,
      recipientReceives,
      annualDefiYield,
      annualSenderPoolYield,
      annualClaimPoolYield,
      annualTotalPoolFeeYield,
      annualOperatorYield,
      annualTsnRevenue,
      annualGrossFeeRevenue,
      annualPoolIncome,
      lpExpectedApy,
      grossFeeApy,
      lpFeeApy,
      assignedDailyVolume,
      vaultDailyCapacity,
      settledDailyVolume,
      vaultShare,
      epochsPerDay,
    };
  }, [activeVaultLiquidity, dailyVolume, transferAmount, vaultDeposit]);

  const tsnLpApy = model.lpExpectedApy;

  return (
    <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="grid gap-4">
        <div className="tl-panel p-5">
          <div className="flex items-center gap-2 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
            <Calculator className="h-4 w-4" />
            Fee Calculator
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-normal text-[var(--text)]">
            See what TSN charges and where it goes.
          </h3>

          <div className="mt-5 space-y-5">
            <Control
              label="Transfer amount"
              value={transferAmount}
              min={10}
              max={5000}
              step={10}
              display={money(transferAmount)}
              onChange={setTransferAmount}
            />
            <div className="grid gap-3 border-t border-[var(--field-border)] pt-4">
              <FeeLine label="Sender pays" value={money(transferAmount + model.senderFee)} note={`${money(transferAmount)} transfer + ${money(model.senderFee)} TSN sender fee`} />
              <FeeLine label="Current Solana network fee" value={`~${money(NETWORK_FEE_USD)}`} note="Shown before confirm; not counted as yield." />
              <FeeLine label="TSN sender fee split" value={money(model.senderFee)} note={`${money(model.senderTsnAmount)} TSN protocol, ${money(model.senderPoolAmount)} vault pool`} />
              <FeeLine label="Claim fee split" value={money(model.claimFee)} note={`${money(model.claimOperatorAmount)} operator, ${money(model.claimPoolAmount)} vault pool`} />
              <FeeLine label="Recipient receives" value={money(model.recipientReceives)} note="Before any claim-side token account setup if needed." />
            </div>
          </div>
        </div>

        <div className="tl-panel p-5">
          <div className="flex items-center gap-2 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
            <TrendingUp className="h-4 w-4" />
            LP APY comparison
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
            This compares the yield a liquidity provider can expect to receive, not the total fee revenue produced by the protocol. Operator share and TSN protocol revenue are shown separately below and are excluded from the LP APY.
          </p>
          <div className="mt-5 space-y-3">
            <ProtocolBar name="TSN LP expected" apy={tsnLpApy} color="#ff7a18" best />
            {SOLANA_PROTOCOLS.map((protocol) => (
              <ProtocolBar key={protocol.name} {...protocol} />
            ))}
          </div>
        </div>
      </div>

      <div className="tl-panel p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-black uppercase tracking-[0.2em] text-[#ff7a18]">Yield Calculator</p>
            <h3 className="mt-3 text-2xl font-black tracking-normal text-[var(--text)]">
              Model LP income from approved asset volume.
            </h3>
          </div>
          <div className="hidden rounded-full border border-[#ff7a18]/30 bg-[#ff7a18]/10 px-3 py-1 text-xs font-black text-[#ff7a18] md:block">
            Volume-based
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <Control
            label="My vault deposit"
            value={vaultDeposit}
            min={1_000}
            max={500_000}
            step={1_000}
            display={compactMoney(vaultDeposit)}
            onChange={setVaultDeposit}
          />
          <Control
            label="Network daily payment volume"
            value={dailyVolume}
            min={5_000}
            max={2_000_000}
            step={5_000}
            display={compactMoney(dailyVolume)}
            onChange={setDailyVolume}
          />
          <Control
            label="Active TSN vault liquidity"
            value={activeVaultLiquidity}
            min={10_000}
            max={10_000_000}
            step={10_000}
            display={compactMoney(activeVaultLiquidity)}
            onChange={setActiveVaultLiquidity}
          />
        </div>

        <div className="mt-6 border-t border-[var(--field-border)] pt-5">
          <YieldLine
            id="vault-share"
            label="Your vault share of liquidity"
            value={percent(model.vaultShare * 100)}
            color="text-[var(--text)]"
            info="This is your vault deposit divided by total active TSN vault liquidity. A $26K vault inside $1M active liquidity owns about 2.6% of settlement capacity, so it should only be assigned about 2.6% of network volume."
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
          <YieldLine
            id="assigned-volume"
            label="Assigned daily volume"
            value={`${money(model.assignedDailyVolume)}/day`}
            color="text-[var(--text)]"
            info="This is the portion of network volume this vault is expected to settle based on its liquidity share. The calculator does not give one vault credit for the entire TSN network volume."
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
          <YieldLine
            id="epoch-capacity"
            label={`${EPOCH_HOURS}h epoch capacity`}
            value={`${money(model.vaultDailyCapacity)}/day`}
            color="text-[var(--text)]"
            info="TSN reimbursement is modeled around 7-hour epochs. A vault can recycle its capital roughly 24 / 7 times per day after proof settlement and reimbursement. If a vault runs out before reimbursement, it waits for the next epoch."
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
          <YieldLine
            id="settled-volume"
            label="Settled by this vault"
            value={`${money(model.settledDailyVolume)}/day`}
            color="text-[var(--accent)]"
            info="This is the smaller of assigned daily volume and epoch capacity. It is the number used for sender-fee and claim-fee yield, so APY cannot assume a small vault settles unlimited volume."
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
          <YieldLine
            id="gross-fees"
            label={`Gross settlement fee yield (${percent(model.grossFeeApy)} before splits)`}
            value={`${money(model.annualGrossFeeRevenue)}/yr`}
            color="text-[var(--text)]"
            info="This is the total sender-fee and claim-fee revenue generated by the volume this vault settles. It is not what LPs receive. It is split between LPs, Cranker operators, and TSN protocol revenue."
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
          <YieldLine
            id="defi-yield"
            label={`DeFi yield (${percent(BASE_DEFI_APY)} base)`}
            value={`${money(model.annualDefiYield)}/yr`}
            color="text-[#ffbf2f]"
            info="Base DeFi yield is calculated from the vault deposit itself. For example, $260K at 10.2% produces about $26.5K per year before TSN fee yield."
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
          <YieldLine
            id="pool-fees"
            label={`Total LP fee share (${percent(model.lpFeeApy)} fee APY)`}
            value={`${money(model.annualTotalPoolFeeYield)}/yr`}
            color="text-[var(--accent)]"
            info={`This is the fee income paid to liquidity providers only. Current model: LPs receive ${Math.round(CLAIM_POOL_SHARE * 100)}% of claim fees and ${Math.round(SENDER_POOL_SHARE * 100)}% of sender fees. Operator and protocol shares are excluded from LP APY.`}
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
          <YieldLine label={`Claim fee pool share (${Math.round(CLAIM_POOL_SHARE * 100)}%)`} value={`${money(model.annualClaimPoolYield)}/yr`} color="text-[var(--accent)]" />
          <YieldLine label={`Sender fee pool share (${Math.round(SENDER_POOL_SHARE * 100)}%)`} value={`${money(model.annualSenderPoolYield)}/yr`} color="text-[#39bfff]" />
          <YieldLine
            id="operator-share"
            label={`Cranker operator share (${Math.round(CLAIM_OPERATOR_SHARE * 100)}%)`}
            value={`${money(model.annualOperatorYield)}/yr`}
            color="text-[#b48cff]"
            info="Cranker operators earn a claim-fee share for uptime, watching intents, paying recipients from vault liquidity, submitting proof, and keeping settlement reliable."
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
          <YieldLine
            id="tsn-revenue"
            label={`TSN protocol revenue (${Math.round(SENDER_TSN_SHARE * 100)}%)`}
            value={`${money(model.annualTsnRevenue)}/yr`}
            color="text-[#ff7a18]"
            info="TSN protocol revenue is intentionally smaller than LP allocation. It comes from a minority share of sender fees and supports protocol development, operations, and user experience."
            openInfo={openInfo}
            setOpenInfo={setOpenInfo}
          />
        </div>

        <div className="mt-6 grid gap-4 rounded-[18px] border border-[#ff7a18]/30 bg-[#ff7a18]/[0.06] p-4 md:grid-cols-2">
          <div>
            <span className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[var(--text-faint)]">LP expected APY</span>
            <strong className="mt-2 block text-4xl font-black text-[#ff7a18]">{percent(model.lpExpectedApy)}</strong>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Base yield plus LP share of TSN fees.</p>
          </div>
          <div>
            <span className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[var(--text-faint)]">Annual LP income</span>
            <strong className="mt-2 block text-4xl font-black text-[#ff7a18]">{money(model.annualPoolIncome)}</strong>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Operator and protocol revenue excluded.</p>
          </div>
        </div>

        <Link href="/operator-dashboard" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#ff7a18] px-5 py-3 text-sm font-black text-[#120703]">
          Deposit as LP <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function Control({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-4">
        <span className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--text-faint)]">{label}</span>
        <strong className="text-sm font-black text-[#ffbf2f]">{display}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          background: `linear-gradient(90deg, var(--accent) ${((value - min) / (max - min)) * 100}%, var(--surface-soft) ${((value - min) / (max - min)) * 100}%)`,
        }}
        className="mt-3 h-2 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function FeeLine({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid gap-1 rounded-[12px] border border-[var(--field-border)] bg-[var(--field)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[var(--text-soft)]">{label}</span>
        <strong className="text-sm font-black text-[var(--text)]">{value}</strong>
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">{note}</p>
    </div>
  );
}

function YieldLine({
  id,
  label,
  value,
  color,
  info,
  openInfo,
  setOpenInfo,
}: {
  id?: string;
  label: string;
  value: string;
  color: string;
  info?: string;
  openInfo?: string | null;
  setOpenInfo?: (id: string | null) => void;
}) {
  const isOpen = Boolean(id && openInfo === id);

  return (
    <div className="border-b border-[var(--field-border)] py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--text-soft)]">
          {label}
          {id && info && setOpenInfo ? (
            <button
              type="button"
              onClick={() => setOpenInfo(isOpen ? null : id)}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--field-border)] bg-[var(--surface-soft)] text-[var(--text-faint)] transition hover:text-[var(--accent)]"
              aria-label={`Explain ${label}`}
            >
              <Info className="h-3 w-3" />
            </button>
          ) : null}
        </span>
        <strong className={`shrink-0 text-sm font-black ${color}`}>{value}</strong>
      </div>
      {isOpen && info ? (
        <p className="mt-2 rounded-[12px] border border-[var(--field-border)] bg-[var(--field)] p-3 text-xs leading-6 text-[var(--muted)]">
          {info}
        </p>
      ) : null}
    </div>
  );
}

function ProtocolBar({
  name,
  apy,
  color,
  best = false,
}: {
  name: string;
  apy: number;
  color: string;
  best?: boolean;
}) {
  const width = Math.min((apy / 90) * 100, 100);

  return (
    <div className="grid grid-cols-[120px_1fr_56px] items-center gap-3 text-xs">
      <span className={best ? "font-black text-[#ff7a18]" : "font-semibold text-[var(--text-soft)]"}>{name}</span>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className={best ? "text-right font-black text-[#ff7a18]" : "text-right font-bold text-[var(--text-soft)]"}>
        {percent(apy)}
      </span>
    </div>
  );
}
