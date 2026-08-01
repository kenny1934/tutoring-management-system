import { redirect } from "next/navigation";

/**
 * The prospect module now spans both the summer and regular intakes, so it lives
 * at /admin/prospects rather than under the summer namespace. This stub keeps
 * old bookmarks and any missed internal links working. The public paste form at
 * /summer/prospect is a separate, subdomain-coupled surface and stays put.
 */
export default function SummerProspectsRedirect({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const focus = searchParams?.focus;
  const query = typeof focus === "string" ? `?focus=${focus}` : "";
  redirect(`/admin/prospects${query}`);
}
