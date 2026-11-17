import { NewAuthExperience } from "@/src/components/experiences/new-auth-experience";
import { constructMetadata } from "@/src/seo/metadata";

// Example of how to add page-specific SEO overrides!
// Because /auth is a private route (in robots.txt), we also set noIndex: true
// so Google absolutely knows not to index this page even if they find a link to it.
export const metadata = constructMetadata({
  title: "Authenticate",
  description:
    "Securely log into TrustLink Pay using your Phone Number (WhatsApp) or Web3 wallet.",
  path: "/auth",
  noIndex: true, // Hides this specific page from search engines
});

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect?.startsWith("/")
    ? params.redirect
    : "/app";

  return <NewAuthExperience redirectTo={redirectTo} />;
}
