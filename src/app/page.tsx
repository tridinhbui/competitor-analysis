import { HomeLanding } from "@/components/landing/HomeLanding";
import { HomeAuthRedirect } from "@/components/auth/HomeAuthRedirect";

export default function HomePage() {
  return (
    <>
      <HomeAuthRedirect />
      <HomeLanding />
    </>
  );
}
