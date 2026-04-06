import { redirect } from "next/navigation";

export default function OverviewPage() {
  redirect("/analyze?tab=snapshot");
}
