import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { config } from "dotenv";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
config({ path: ".env.local" });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    const users = await client.query("SELECT * FROM users");
    const payments = await client.query("SELECT * FROM payments");
    const phoneVerifications = await client.query("SELECT * FROM phone_verifications");
    const webhookEvents = await client.query("SELECT * FROM whatsapp_webhook_events");
    const receiverWallets = await client.query("SELECT * FROM receiver_wallets");

    const backupDir = resolve(process.cwd(), ".backups");
    mkdirSync(backupDir, { recursive: true });

    const backupPath = resolve(backupDir, `neon-reset-backup-${Date.now()}.json`);
    writeFileSync(
      backupPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          users: users.rows,
          payments: payments.rows,
          phoneVerifications: phoneVerifications.rows,
          webhookEvents: webhookEvents.rows,
          receiverWallets: receiverWallets.rows
        },
        null,
        2
      )
    );

    await client.query(`
      TRUNCATE TABLE
        whatsapp_webhook_events,
        phone_verifications,
        receiver_wallets,
        payments,
        users
      RESTART IDENTITY CASCADE
    `);

    console.log(`Database reset successfully. Backup saved to ${backupPath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database reset failed.");
  console.error(error);
  process.exit(1);
});
