import { Suspense } from "react";

import { SendExperience } from "@/src/components/experiences/send-experience";

export default function SendPage() {
  return (
    <Suspense fallback={null}>
      <SendExperience />
    </Suspense>
  );
}
