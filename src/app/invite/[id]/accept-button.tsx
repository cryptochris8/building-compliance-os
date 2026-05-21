"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { acceptInvitation } from "@/app/actions/members";

export function AcceptInviteButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const handleAccept = () => {
    startTransition(async () => {
      const result = await acceptInvitation(invitationId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setDone(true);
        toast.success("Invitation accepted — welcome aboard!");
        router.push("/dashboard");
      }
    });
  };

  return (
    <Button onClick={handleAccept} disabled={isPending || done} className="w-full">
      {isPending ? "Accepting…" : done ? "Accepted" : "Accept invitation"}
    </Button>
  );
}
