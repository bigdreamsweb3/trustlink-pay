import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const phoneNumber = process.argv[2];

  if (!phoneNumber) {
    console.error("Usage: npm run test:whatsapp-number -- <E164_PHONE_NUMBER>");
    process.exit(1);
  }

  const { verifyWhatsAppNumber } = await import("../app/services/whatsapp-number-verification");
  const result = await verifyWhatsAppNumber(phoneNumber);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("WhatsApp number verification test failed.");
  console.error(error);
  process.exit(1);
});
