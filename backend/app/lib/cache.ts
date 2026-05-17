import { revalidateTag, unstable_cache } from "next/cache";

export const CACHE_TAGS = {
  identity: "identity",
  payments: "payments",
  recipients: "recipients",
  walletTokens: "wallet-tokens",
  whatsapp: "whatsapp",
} as const;

export const CACHE_TTL_SECONDS = {
  identity: 20,
  payments: 10,
  recipientLookup: 60,
  walletTokens: 20,
  whatsappVerification: 5 * 60,
} as const;

export function cachedQuery<Args extends unknown[], Result>(
  namespace: string,
  fn: (...args: Args) => Promise<Result>,
  options: {
    revalidate: number;
    tags: string[];
  },
) {
  return unstable_cache(fn, [namespace], {
    revalidate: options.revalidate,
    tags: options.tags,
  });
}

export function invalidateUserCache(_userId?: string | null) {
  revalidateTag(CACHE_TAGS.identity);
  revalidateTag(CACHE_TAGS.payments);
  revalidateTag(CACHE_TAGS.walletTokens);
}

export function invalidatePaymentCache(_paymentId?: string | null) {
  revalidateTag(CACHE_TAGS.payments);
}

export function invalidateRecipientCache() {
  revalidateTag(CACHE_TAGS.recipients);
  revalidateTag(CACHE_TAGS.whatsapp);
}
