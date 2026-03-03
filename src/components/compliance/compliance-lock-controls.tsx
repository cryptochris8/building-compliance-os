"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Lock, Unlock, ShieldCheck, AlertTriangle } from "lucide-react";
import { lockComplianceYear, unlockComplianceYear } from "@/app/actions/compliance-workflow";

interface LockControlsProps {
  buildingId: string;
  year: number;
  locked: boolean;
  lockedAt: string | null;
}

export function ComplianceLockControls({ buildingId, year, locked, lockedAt }: LockControlsProps) {
  const router = useRouter();
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleLock = async () => {
    setProcessing(true);
    await lockComplianceYear(buildingId, year);
    setProcessing(false);
    setLockDialogOpen(false);
    router.refresh();
  };

  const handleUnlock = async () => {
    if (!unlockReason.trim()) return;
    setProcessing(true);
    await unlockComplianceYear(buildingId, year, unlockReason.trim());
    setProcessing(false);
    setUnlockDialogOpen(false);
    setUnlockReason("");
    router.refresh();
  };

  if (locked) {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Compliance Year {year} is Locked
              </p>
              {lockedAt && (
                <p className="text-xs text-amber-600">
                  Locked on {new Date(lockedAt).toLocaleDateString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Readings, deductions, and checklist cannot be modified while locked.
              </p>
            </div>
          </div>
          <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Unlock className="h-4 w-4 mr-1" /> Unlock
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Unlock Compliance Year {year}</DialogTitle>
                <DialogDescription>
                  Provide a reason for unlocking. This will allow edits to readings, deductions, and the checklist.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="Reason for unlocking..."
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setUnlockDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleUnlock} disabled={processing || !unlockReason.trim()}>
                  {processing ? "Unlocking..." : "Unlock"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Lock this compliance year after submission to prevent accidental edits.
          </p>
        </div>
        <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Lock className="h-4 w-4 mr-1" /> Lock Year
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lock Compliance Year {year}</DialogTitle>
              <DialogDescription>
                Locking will prevent any changes to readings, deductions, and the compliance checklist for this year. Are you sure?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLockDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleLock} disabled={processing}>
                {processing ? "Locking..." : "Lock Year"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
