import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAMES } from "@/lib/cookies";

export default function Home() {
  const cookieStore = cookies();
  const hasSession = cookieStore.has(COOKIE_NAMES.ACCESS_TOKEN);

  if (hasSession) {
    redirect("/dashboard");
  }

  redirect("/login");
}
