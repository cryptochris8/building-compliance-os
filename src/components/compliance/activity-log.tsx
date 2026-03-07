"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageSquare, Calculator, FileText, CheckSquare, Lock, Minus, Plus,
} from "lucide-react";
import { addComplianceNote } from "@/app/actions/compliance-workflow";

interface Activity {
  id: string;
  activityType: string;
  description: string;
  metadata: unknown;
  createdAt: Date | null;
  actorId: string | null;
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  note: <MessageSquare className="h-4 w-4 text-blue-500" />,
  status_change: <CheckSquare className="h-4 w-4 text-purple-500" />,
  calculation: <Calculator className="h-4 w-4 text-orange-500" />,
  document_upload: <FileText className="h-4 w-4 text-green-500" />,
  checklist_update: <CheckSquare className="h-4 w-4 text-teal-500" />,
  lock_change: <Lock className="h-4 w-4 text-red-500" />,
  deduction_change: <Minus className="h-4 w-4 text-indigo-500" />,
};

function formatTimestamp(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function ActivityLog({
  activities,
  buildingId,
  year,
}: {
  activities: Activity[];
  buildingId: string;
  year: number;
}) {
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSubmitting(true);
    await addComplianceNote(buildingId, year, noteText.trim());
    setNoteText("");
    setSubmitting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add note form */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }}
          />
          <Button onClick={handleAddNote} disabled={submitting || !noteText.trim()} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {/* Timeline */}
        <div className="space-y-1">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet.</p>
          ) : (
            [...activities].reverse().map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                <div className="mt-0.5">
                  {ACTIVITY_ICONS[a.activityType] || <MessageSquare className="h-4 w-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{a.description}</p>
                  <p className="text-xs text-muted-foreground">{formatTimestamp(a.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
