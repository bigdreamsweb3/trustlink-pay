import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const phoneNumber =
    process.env.TEST_RECIPIENT_LOOKUP_PHONE_NUMBER ??
    process.env.TEST_AUTH_PHONE_NUMBER ??
    process.env.TEST_RECIPIENT_PHONE_NUMBER;

  if (!phoneNumber) {
    throw new Error(
      "Set TEST_RECIPIENT_LOOKUP_PHONE_NUMBER or TEST_RECIPIENT_PHONE_NUMBER in backend/.env.local",
    );
  }

  const { findUserByPhoneNumber } = await import("../app/db/users");
  const { findLatestWhatsAppProfileNameByPhoneNumber } = await import(
    "../app/db/whatsapp-webhook-events"
  );
  const { lookupRecipientIdentity } = await import("../app/services/recipients");

  const user = await findUserByPhoneNumber(phoneNumber);
  const whatsappProfileName = await findLatestWhatsAppProfileNameByPhoneNumber(phoneNumber);
  const lookup = await lookupRecipientIdentity(phoneNumber);

  console.log(
    JSON.stringify(
      {
        phoneNumber,
        user,
        whatsappProfileName,
        lookup,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Recipient lookup test failed.");
  console.error(error);
  process.exit(1);
});
