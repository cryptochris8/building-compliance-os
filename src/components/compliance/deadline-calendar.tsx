"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Deadline {
  buildingId: string;
  buildingName: string;
  reportDueDate: string;
  status: string;
  daysUntilDue: number;
  reportSubmitted: boolean;
  year: number;
}

function getStatusDot(status: string, submitted: boolean): string {
  if (submitted) return "bg-green-500";
  if (status === "over_limit") return "bg-red-500";
  if (status === "at_risk") return "bg-yellow-500";
  if (status === "compliant") return "bg-green-500";
  return "bg-gray-400";
}

export function DeadlineCalendarView({ deadlines }: { deadlines: Deadline[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const deadlinesByDay = useMemo(() => {
    const map: Record<number, Deadline[]> = {};
    for (const d of deadlines) {
      const dueDate = new Date(d.reportDueDate);
      if (dueDate.getFullYear() === currentYear && dueDate.getMonth() === currentMonth) {
        const day = dueDate.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(d);
      }
    }
    return map;
  }, [deadlines, currentYear, currentMonth]);

  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle>{monthNames[currentMonth]} {currentYear}</CardTitle>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">{day}</div>
          ))}
          {cells.map((day, i) => (
            <div key={i} className={"min-h-[80px] border rounded p-1 text-sm " + (day ? "bg-card" : "bg-muted/30")}>
              {day && (
                <>
                  <div className="font-medium text-xs mb-1">{day}</div>
                  {(deadlinesByDay[day] || []).map((d) => (
                    <Link
                      key={d.buildingId + d.year}
                      href={"/buildings/" + d.buildingId + "/compliance?year=" + d.year}
                      className="block text-xs truncate hover:underline mb-0.5"
                    >
                      <span className={"inline-block w-2 h-2 rounded-full mr-1 " + getStatusDot(d.status, d.reportSubmitted)} />
                      {d.buildingName}
                    </Link>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
