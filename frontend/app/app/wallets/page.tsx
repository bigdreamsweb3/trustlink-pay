import { redirect } from "next/navigation";

export default function WalletsPage() {
  redirect("/app/identity?section=wallets");
}
