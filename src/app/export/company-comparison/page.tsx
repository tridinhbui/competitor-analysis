import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Legacy print/PDF URL — forwards the same query string to the PowerPoint export API
 * so bookmarks and shared links still download a .pptx.
 */
export default async function CompanyComparisonExportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (raw == null || raw === "") continue;
    qs.set(key, Array.isArray(raw) ? raw[0] : raw);
  }
  redirect(`/api/export/company-comparison-pptx?${qs.toString()}`);
}
