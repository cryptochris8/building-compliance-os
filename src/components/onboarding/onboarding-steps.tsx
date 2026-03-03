"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Building2, CheckCircle2, ChevronRight, FileBarChart, Gauge, Zap, PartyPopper } from "lucide-react";
import { NYC_OCCUPANCY_TYPES } from "@/types";

const STEPS = [
  { title: "Welcome", icon: Zap },
  { title: "Add Building", icon: Building2 },
  { title: "Utility Data", icon: Gauge },
  { title: "Compliance", icon: FileBarChart },
  { title: "Done!", icon: PartyPopper },
];

export function OnboardingSteps() {
  const [step, setStep] = useState(1);
  const [bd, setBd] = useState({ name: "", address: "", sqft: "", occ: "" });
  const [ud, setUd] = useState({ elec: "", gas: "" });
  const pct = ((step - 1) / (STEPS.length - 1)) * 100;
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length));
  const prev = () => setStep((s) => Math.max(s - 1, 1));
  const est = Number(ud.elec || 0) * 12 * 0.000288962 + Number(ud.gas || 0) * 100 * 12 * 0.00005311;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          {STEPS.map((s, i) => (
            <span key={s.title} className={i + 1 <= step ? "text-primary font-medium" : ""}>{s.title}</span>
          ))}
        </div>
        <Progress value={pct} />
      </div>

      {step === 1 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-primary/10 p-4 w-fit">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Building Compliance OS</CardTitle>
            <CardDescription className="text-base">
              Get your building&apos;s LL97 compliance status in minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm">
              {["Add your building details", "Enter utility data", "See your compliance status"].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="font-medium">{t}</p>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={next}>
              Get Started <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Add Your First Building</CardTitle>
            <CardDescription>Enter your building basics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="ob-n">Building Name</Label><Input id="ob-n" placeholder="123 Main Street" value={bd.name} onChange={(e) => setBd((d) => ({ ...d, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="ob-a">Address</Label><Input id="ob-a" placeholder="123 Main St, New York, NY 10001" value={bd.address} onChange={(e) => setBd((d) => ({ ...d, address: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="ob-s">Gross Square Footage</Label><Input id="ob-s" type="number" placeholder="50000" value={bd.sqft} onChange={(e) => setBd((d) => ({ ...d, sqft: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Occupancy Type</Label>
              <Select value={bd.occ} onValueChange={(v) => setBd((d) => ({ ...d, occ: v }))}>
                <SelectTrigger><SelectValue placeholder="Select occupancy type" /></SelectTrigger>
                <SelectContent>{NYC_OCCUPANCY_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={prev}>Back</Button>
              <Button className="flex-1" onClick={next} disabled={!bd.name || !bd.address || !bd.sqft || !bd.occ}>Continue <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Enter Utility Data</CardTitle>
            <CardDescription>Enter one month of data to get started.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="ob-e">Monthly Electricity (kWh)</Label><Input id="ob-e" type="number" placeholder="50000" value={ud.elec} onChange={(e) => setUd((d) => ({ ...d, elec: e.target.value }))} /><p className="text-xs text-muted-foreground">From your electricity bill.</p></div>
            <div className="space-y-2"><Label htmlFor="ob-g">Monthly Natural Gas (therms)</Label><Input id="ob-g" type="number" placeholder="3000" value={ud.gas} onChange={(e) => setUd((d) => ({ ...d, gas: e.target.value }))} /><p className="text-xs text-muted-foreground">From your gas bill.</p></div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={prev}>Back</Button>
              <Button className="flex-1" onClick={next} disabled={!ud.elec && !ud.gas}>Calculate <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileBarChart className="h-5 w-5" /> Your Compliance Status</CardTitle>
            <CardDescription>Preview based on your data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-6 space-y-3">
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Building</span><span className="font-medium">{bd.name || "Your Building"}</span></div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Size</span><span className="font-medium">{Number(bd.sqft || 0).toLocaleString()} sqft</span></div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Estimated Annual Emissions</p>
              <p className="text-3xl font-bold text-primary">{est.toFixed(1)}{" "}<span className="text-base font-normal text-muted-foreground">tCO2e</span></p>
              <p className="text-xs text-muted-foreground mt-2">Based on 1 month extrapolated to 12.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={prev}>Back</Button>
              <Button className="flex-1" onClick={next}>Finish Setup <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900 p-4 w-fit">
              <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
            <CardDescription className="text-base">Your building is ready to track.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <Link href="/dashboard"><Button variant="outline" className="w-full justify-start"><Gauge className="mr-2 h-4 w-4" /> Go to Dashboard</Button></Link>
              <Link href="/buildings"><Button variant="outline" className="w-full justify-start"><Building2 className="mr-2 h-4 w-4" /> Manage Buildings</Button></Link>
              <Link href="/portfolio"><Button variant="outline" className="w-full justify-start"><FileBarChart className="mr-2 h-4 w-4" /> Generate Reports</Button></Link>
            </div>
            <Link href="/dashboard"><Button className="w-full mt-4">Go to Dashboard</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
