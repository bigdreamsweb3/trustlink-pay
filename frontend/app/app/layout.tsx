import { AuthGuard } from "@/src/components/auth-guard";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
