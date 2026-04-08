import { notFound } from "next/navigation";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import NewReadingClient from "./new-reading-client";

export default async function NewReadingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await assertBuildingAccess(id);
  if (!access) {
    notFound();
  }

  return <NewReadingClient />;
}
