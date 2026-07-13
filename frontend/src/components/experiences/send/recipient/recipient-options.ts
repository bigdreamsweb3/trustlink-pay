import type { TrustLinkContact } from "@/src/lib/contacts/types";
import type { PaymentRecord } from "@/src/lib/types";

import type { SendRecipientOption } from "./types";

function normalizeTinFromPayment(payment: PaymentRecord) {
  if (payment.receiver_tin) return payment.receiver_tin;
  const match = payment.receiver_phone.match(/^tin:(\d{10})$/i);
  return match?.[1] ?? null;
}

function getOptionKey(option: Pick<SendRecipientOption, "tin" | "phoneNumber">) {
  return option.tin ? `tin:${option.tin}` : `phone:${option.phoneNumber}`;
}

export function buildSendRecipientOptions(params: {
  contacts: TrustLinkContact[];
  payments: PaymentRecord[];
  userId: string;
}) {
  const options = new Map<string, SendRecipientOption>();

  for (const contact of params.contacts) {
    const option: SendRecipientOption = {
      id: `contact:${contact.id}`,
      displayName: contact.displayName,
      phoneNumber: contact.phoneNumber,
      tin: contact.tin,
      trustlinkHandle: contact.trustlinkHandle,
      source: "contact",
      lastUsedAt: contact.lastPaidAt ?? contact.updatedAt,
    };
    options.set(getOptionKey(option), option);
  }

  for (const payment of params.payments) {
    if (payment.sender_user_id !== params.userId) continue;
    const tin = normalizeTinFromPayment(payment);
    const phoneNumber = payment.receiver_phone.startsWith("tin:")
      ? null
      : payment.receiver_phone;
    if (!tin && !phoneNumber) continue;
    const key = getOptionKey({ tin, phoneNumber });
    if (options.has(key)) continue;

    options.set(key, {
      id: `payment:${payment.id}`,
      displayName:
        payment.receiver_display_name ??
        (payment.receiver_handle ? `@${payment.receiver_handle}` : null) ??
        (tin ? `TIN ${tin}` : phoneNumber!),
      phoneNumber,
      tin,
      trustlinkHandle: payment.receiver_handle ?? null,
      source: "recent",
      lastUsedAt: payment.created_at,
    });
  }

  return [...options.values()].sort((left, right) =>
    (right.lastUsedAt ?? "").localeCompare(left.lastUsedAt ?? ""),
  );
}

export function searchSendRecipientOptions(
  options: SendRecipientOption[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return options;

  return options.filter((option) =>
    [
      option.displayName,
      option.phoneNumber,
      option.tin,
      option.trustlinkHandle,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery)),
  );
}
