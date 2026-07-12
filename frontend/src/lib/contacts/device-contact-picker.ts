import type { DeviceContactCandidate } from "@/src/lib/contacts/types";

type ContactPickerEntry = {
  name?: string[];
  tel?: string[];
};

type ContactPickerNavigator = Navigator & {
  contacts?: {
    select: (
      properties: Array<"name" | "tel">,
      options?: { multiple?: boolean },
    ) => Promise<ContactPickerEntry[]>;
    getProperties?: () => Promise<string[]>;
  };
};

export function canPickDeviceContacts() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const contactNavigator = navigator as ContactPickerNavigator;
  return Boolean(contactNavigator.contacts?.select);
}

function normalizeCandidate(entry: ContactPickerEntry): DeviceContactCandidate[] {
  const displayName = entry.name?.find(Boolean)?.trim() || "Imported contact";

  return (entry.tel ?? [])
    .map((phoneNumber) => phoneNumber.trim())
    .filter(Boolean)
    .map((phoneNumber) => ({
      displayName,
      phoneNumber,
    }));
}

export async function pickDeviceContacts(): Promise<DeviceContactCandidate[]> {
  const contactNavigator = navigator as ContactPickerNavigator;

  if (!contactNavigator.contacts?.select) {
    throw new Error("Device contact import is not available in this browser.");
  }

  const selectedContacts = await contactNavigator.contacts.select(
    ["name", "tel"],
    { multiple: true },
  );

  return selectedContacts.flatMap(normalizeCandidate);
}
