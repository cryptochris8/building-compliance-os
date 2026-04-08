import { notFound } from "next/navigation";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import AccountsClient from "./accounts-client";

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await assertBuildingAccess(id);
  if (!access) {
    notFound();
  }

  return <AccountsClient />;
}
