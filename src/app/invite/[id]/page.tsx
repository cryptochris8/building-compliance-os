import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getInvitationForAccept } from "@/app/actions/members";
import { getAuthUser } from "@/lib/auth/helpers";
import { AcceptInviteButton } from "./accept-button";

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getInvitationForAccept(id);
  const user = await getAuthUser();

  let content: React.ReactNode;

  if ("error" in result) {
    content = (
      <CardHeader>
        <CardTitle>Invitation not found</CardTitle>
        <CardDescription>
          This invitation link is invalid or has been removed. Ask whoever invited you to send a new one.
        </CardDescription>
      </CardHeader>
    );
  } else {
    const inv = result.invitation;
    const roleLabel = inv.role === "admin" ? "an admin" : "a member";
    const next = encodeURIComponent(`/invite/${id}`);

    if (inv.state === "expired") {
      content = (
        <CardHeader>
          <CardTitle>Invitation expired</CardTitle>
          <CardDescription>
            This invitation to join {inv.orgName} has expired. Ask whoever invited you to send a new one.
          </CardDescription>
        </CardHeader>
      );
    } else if (inv.state === "accepted") {
      content = (
        <CardHeader>
          <CardTitle>Already accepted</CardTitle>
          <CardDescription>
            This invitation has already been accepted.{" "}
            <Link href="/dashboard" className="underline">Go to your dashboard</Link>.
          </CardDescription>
        </CardHeader>
      );
    } else if (inv.state === "canceled") {
      content = (
        <CardHeader>
          <CardTitle>Invitation canceled</CardTitle>
          <CardDescription>
            This invitation to join {inv.orgName} was canceled by the organization.
          </CardDescription>
        </CardHeader>
      );
    } else if (!user) {
      content = (
        <>
          <CardHeader>
            <CardTitle>Join {inv.orgName}</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join {inv.orgName} as {roleLabel} on Building Compliance OS.
              Sign in or create an account with {inv.email} to accept.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full">
              <Link href={`/signup?redirect=${next}`}>Create an account</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/login?redirect=${next}`}>Sign in</Link>
            </Button>
          </CardContent>
        </>
      );
    } else if ((user.email ?? "").toLowerCase() !== inv.email.toLowerCase()) {
      content = (
        <>
          <CardHeader>
            <CardTitle>Wrong account</CardTitle>
            <CardDescription>
              This invitation was sent to {inv.email}, but you&apos;re signed in as {user.email}.
              Sign in with {inv.email} to accept it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/login?redirect=${next}`}>Switch account</Link>
            </Button>
          </CardContent>
        </>
      );
    } else {
      content = (
        <>
          <CardHeader>
            <CardTitle>Join {inv.orgName}</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join {inv.orgName} as {roleLabel}. Accept to start collaborating.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AcceptInviteButton invitationId={id} />
          </CardContent>
        </>
      );
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">{content}</Card>
    </div>
  );
}
