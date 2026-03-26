import { AuthExperience } from "@/src/components/auth-experience";

export default async function AuthPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect?.startsWith("/") ? params.redirect : "/app";

  return <AuthExperience redirectTo={redirectTo} />;
}
