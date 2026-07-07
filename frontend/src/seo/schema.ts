import { BASE_URL, getAbsoluteUrl } from "./routes";

/**
 * Helper to wrap schema objects in the <script type="application/ld+json"> tag.
 */
export function generateSchemaScript(schema: Record<string, any>) {
  return {
    __html: JSON.stringify(schema),
  };
}

/**
 * TrustLink Pay Organization Schema
 */
export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TrustLink Pay",
    url: BASE_URL,
    logo: getAbsoluteUrl("/logo.png"), // Assuming a logo.png exists in public
    sameAs: [
      "https://twitter.com/0xbigdream",
      "https://github.com/bigdreamsweb3/trustlink-pay",
    ],
    description: "Web3 payment protocol and identity-first crypto payment system on Solana.",
  };
}

/**
 * TrustLink Pay WebSite Schema
 */
export function getWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TrustLink Pay",
    url: BASE_URL,
    description: "Web3 payment protocol for secure, noncustodial crypto payments.",
  };
}

/**
 * SoftwareApplication Schema (for the app itself)
 */
export function getSoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "TrustLink Pay App",
    operatingSystem: "All",
    applicationCategory: "FinanceApplication",
    url: BASE_URL,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description: "Send stablecoins using phone numbers on Solana with private settlement through TSN.",
  };
}

/**
 * Breadcrumb Schema
 */
export function getBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: getAbsoluteUrl(item.path),
    })),
  };
}

/**
 * TechArticle Schema (for Documentation)
 */
export function getTechArticleSchema({
  title,
  description,
  path,
  datePublished,
  dateModified,
}: {
  title: string;
  description: string;
  path: string;
  datePublished?: string;
  dateModified?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    url: getAbsoluteUrl(path),
    publisher: {
      "@type": "Organization",
      name: "TrustLink Pay",
    },
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
  };
}

/**
 * FAQ Schema
 */
export function getFAQSchema(questions: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };
}
