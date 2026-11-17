import { sql } from "@/app/db/client";
import type { ReceiverWalletRecord } from "@/app/types/payment";

export async function countReceiverWalletsByUserId(userId: string): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::text AS count
    FROM receiver_wallets
    WHERE user_id = ${userId}
  `) as { count: string }[];

  return Number(rows[0]?.count ?? 0);
}

export async function createReceiverWallet(params: {
  userId: string;
  walletName: string;
  walletAddress: string;
}): Promise<ReceiverWalletRecord> {
  const rows = (await sql`
    INSERT INTO receiver_wallets (user_id, wallet_name, wallet_address)
    VALUES (${params.userId}, ${params.walletName}, ${params.walletAddress})
    RETURNING id, user_id, wallet_name, wallet_address, created_at
  `) as ReceiverWalletRecord[];

  return rows[0];
}

export async function listReceiverWalletsByUserId(userId: string): Promise<ReceiverWalletRecord[]> {
  const rows = (await sql`
    SELECT id, user_id, wallet_name, wallet_address, created_at
    FROM receiver_wallets
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `) as ReceiverWalletRecord[];

  return rows;
}

export async function findReceiverWalletByName(userId: string, walletName: string): Promise<ReceiverWalletRecord | null> {
  const rows = (await sql`
    SELECT id, user_id, wallet_name, wallet_address, created_at
    FROM receiver_wallets
    WHERE user_id = ${userId}
      AND LOWER(wallet_name) = LOWER(${walletName})
    LIMIT 1
  `) as ReceiverWalletRecord[];

  return rows[0] ?? null;
}

export async function findReceiverWalletByAddress(userId: string, walletAddress: string): Promise<ReceiverWalletRecord | null> {
  const rows = (await sql`
    SELECT id, user_id, wallet_name, wallet_address, created_at
    FROM receiver_wallets
    WHERE user_id = ${userId}
      AND wallet_address = ${walletAddress}
    LIMIT 1
  `) as ReceiverWalletRecord[];

  return rows[0] ?? null;
}

export async function findReceiverWalletById(id: string, userId: string): Promise<ReceiverWalletRecord | null> {
  const rows = (await sql`
    SELECT id, user_id, wallet_name, wallet_address, created_at
    FROM receiver_wallets
    WHERE id = ${id}
      AND user_id = ${userId}
    LIMIT 1
  `) as ReceiverWalletRecord[];

  return rows[0] ?? null;
}

export async function deleteReceiverWalletById(id: string, userId: string): Promise<ReceiverWalletRecord | null> {
  const rows = (await sql`
    DELETE FROM receiver_wallets
    WHERE id = ${id}
      AND user_id = ${userId}
    RETURNING id, user_id, wallet_name, wallet_address, created_at
  `) as ReceiverWalletRecord[];

  return rows[0] ?? null;
}
