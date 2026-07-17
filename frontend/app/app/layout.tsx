import { AuthGuard } from "@/src/components/auth-guard";
import { WalletProvider } from "@/src/lib/wallet-provider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <WalletProvider>{children}</WalletProvider>
    </AuthGuard>
  );
}
