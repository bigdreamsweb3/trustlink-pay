import { LandingPage } from "@/src/components/landing-page";
import {
  generateSchemaScript,
  getBreadcrumbSchema,
  getFAQSchema,
  getSoftwareApplicationSchema,
} from "@/src/seo/schema";

export default function HomePage() {
  const appSchema = getSoftwareApplicationSchema();
  const breadcrumbSchema = getBreadcrumbSchema([{ name: "Home", path: "/" }]);
  const faqSchema = getFAQSchema([
    {
      question: "What is TrustLink Pay?",
      answer:
        "TrustLink Pay is an identity-first blockchain payment solution for stablecoin payments on Solana. It lets users pay a phone number or Transfer Identity Number instead of a wallet address.",
    },
    {
      question: "Is TSN the same as TrustLink Pay?",
      answer:
        "No. TrustLink Pay is the payment system users and developers interact with. TSN, the Transfer Settlement Network, is the settlement protocol that coordinates private payment execution.",
    },
    {
      question: "How does TrustLink Pay improve blockchain payments?",
      answer:
        "TrustLink Pay combines Transfer Identity, PRU-routed balances, stablecoin payments, Cranker execution, and TSN settlement so blockchain payments can feel closer to everyday payment apps while remaining verifiable on Solana.",
    },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={generateSchemaScript(appSchema)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={generateSchemaScript(breadcrumbSchema)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={generateSchemaScript(faqSchema)}
      />
      <LandingPage />
    </>
  );
}
