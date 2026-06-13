import { redirect } from "next/navigation";

export default function ProfilePage() {
  redirect("/app/identity?section=profile");
}
