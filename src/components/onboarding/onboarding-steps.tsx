"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Building2, CheckCircle2, ChevronRight, FileBarChart, Gauge, Zap, PartyPopper, Loader2 } from "lucide-react";
import { NYC_OCCUPANCY_TYPES } from "@/types";
import { createBuilding } from "@/app/actions/buildings";
import { createUtilityAccount } from "@/app/actions/utility-accounts";
import { createReading } from "@/app/actions/readings";
import { toast } from "sonner";

const STEPS = [
  { title: "Welcome", icon: Zap },
  { title: "Add Building", icon: Building2 },
  { title: "Utility Data", icon: Gauge },
  { title: "Compliance", icon: FileBarChart },
  { title: "Done!", icon: PartyPopper },
];

export function OnboardingSteps() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [createdBuildingId, setCreatedBuildingId] = useState<string | null>(null);

  // Building data
  const [buildingName, setBuildingName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("New York");
  const [state, setState] = useState("NY");
  const [zip, setZip] = useState("");
  const [sqft, setSqft] = useState("");
  const [occupancyType, setOccupancyType] = useState("");

  // Utility data
  const [monthlyElec, setMonthlyElec] = useState("");
  const [monthlyGas, setMonthlyGas] = useState("");

  const pct = ((step - 1) / (STEPS.length - 1)) * 100;
  const prev = () => setStep((s) => Math.max(s - 1, 1));

  // Estimated annual emissions (rough preview based on 1 month)
  const est =
    Number(monthlyElec || 0) * 12 * 0.000288962 +
    Number(monthlyGas || 0) * 100 * 12 * 0.00005311;

  const buildingValid = buildingName && address && sqft && occupancyType && zip;
  const utilityValid = monthlyElec || monthlyGas;

  const handleFinishSetup = async () => {
    setSaving(true);
    try {
      // 1. Create building
      const buildingResult = await createBuilding({
        name: buildingName,
        addressLine1: address,
        city,
        state,
        zip,
        grossSqft: sqft,
        occupancyType,
        jurisdictionId: "nyc-ll97",
      });

      if (buildingResult.error || !buildingResult.building) {
        toast.error(buildingResult.error || "Failed to create building");
        setSaving(false);
        return;
      }

      const buildingId = buildingResult.building.id;
      setCreatedBuildingId(buildingId);

      // 2. Create utility accounts and initial readings
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      if (monthlyElec && Number(monthlyElec) > 0) {
        const elecResult = await createUtilityAccount({
          buildingId,
          utilityType: "electricity",
          accountNumber: "Electricity Main",
        });
        if (elecResult.success && elecResult.account) {
          await createReading({
            utilityAccountId: elecResult.account.id,
            buildingId,
            periodMonth: currentMonth,
            periodYear: currentYear,
            consumptionValue: monthlyElec,
            consumptionUnit: "kwh",
            source: "manual",
            confidence: "estimated",
          });
        }
      }

      if (monthlyGas && Number(monthlyGas) > 0) {
        const gasResult = await createUtilityAccount({
          buildingId,
          utilityType: "natural_gas",
          accountNumber: "Natural Gas Main",
        });
        if (gasResult.success && gasResult.account) {
          await createReading({
            utilityAccountId: gasResult.account.id,
            buildingId,
            periodMonth: currentMonth,
            periodYear: currentYear,
            consumptionValue: monthlyGas,
            consumptionUnit: "therms",
            source: "manual",
            confidence: "estimated",
          });
        }
      }

      toast.success("Building created with initial utility data!");
      setStep(5);
    } catch {
      toast.error("An unexpected error occurred during setup");
    } finally {
      setSaving(false);
    }
  };

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
              <Zap className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">Welcome to Building Compliance OS</CardTitle>
            <CardDescription className="text-base">
              Get your building&apos;s compliance status in minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm">
              {["Add your building details", "Enter utility data", "See your compliance status"].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="font-medium">{t}</p>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => setStep(2)}>
              Get Started <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" aria-hidden="true" /> Add Your First Building
            </CardTitle>
            <CardDescription>Enter your building basics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ob-name">Building Name</Label>
              <Input id="ob-name" placeholder="e.g. 123 Main Street" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-addr">Street Address</Label>
              <Input id="ob-addr" placeholder="123 Main St" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="ob-city">City</Label>
                <Input id="ob-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-state">State</Label>
                <Input id="ob-state" maxLength={2} placeholder="NY" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-zip">ZIP</Label>
                <Input id="ob-zip" placeholder="10001" value={zip} onChange={(e) => setZip(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-sqft">Gross Square Footage</Label>
              <Input id="ob-sqft" type="number" placeholder="50000" value={sqft} onChange={(e) => setSqft(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Occupancy Type</Label>
              <Select value={occupancyType} onValueChange={setOccupancyType}>
                <SelectTrigger><SelectValue placeholder="Select occupancy type" /></SelectTrigger>
                <SelectContent>{NYC_OCCUPANCY_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={prev}>Back</Button>
              <Button className="flex-1" onClick={() => setStep(3)} disabled={!buildingValid}>
                Continue <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" aria-hidden="true" /> Enter Utility Data
            </CardTitle>
            <CardDescription>Enter one month of data to get a quick compliance estimate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ob-elec">Monthly Electricity (kWh)</Label>
              <Input id="ob-elec" type="number" placeholder="50000" value={monthlyElec} onChange={(e) => setMonthlyElec(e.target.value)} />
              <p className="text-xs text-muted-foreground">From your electricity bill. Leave blank if not applicable.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-gas">Monthly Natural Gas (therms)</Label>
              <Input id="ob-gas" type="number" placeholder="3000" value={monthlyGas} onChange={(e) => setMonthlyGas(e.target.value)} />
              <p className="text-xs text-muted-foreground">From your gas bill. Leave blank if not applicable.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={prev}>Back</Button>
              <Button className="flex-1" onClick={() => setStep(4)} disabled={!utilityValid}>
                See Estimate <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5" aria-hidden="true" /> Your Compliance Estimate
            </CardTitle>
            <CardDescription>Preview based on your data. We&apos;ll save everything when you finish.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-6 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Building</span>
                <span className="font-medium">{buildingName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Size</span>
                <span className="font-medium">{Number(sqft || 0).toLocaleString()} sqft</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <span className="font-medium">{occupancyType}</span>
              </div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Estimated Annual Emissions</p>
              <p className="text-3xl font-bold text-primary">
                {est.toFixed(1)} <span className="text-base font-normal text-muted-foreground">tCO2e</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">Based on 1 month extrapolated to 12. Add more months for accuracy.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={prev}>Back</Button>
              <Button className="flex-1" onClick={handleFinishSetup} disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Building...</>
                ) : (
                  <>Finish Setup <ChevronRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900 p-4 w-fit">
              <PartyPopper className="h-8 w-8 text-green-700 dark:text-green-400" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
            <CardDescription className="text-base">
              Your building has been created with initial utility data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {createdBuildingId && (
                <Button variant="outline" className="w-full justify-start" onClick={() => router.push("/buildings/" + createdBuildingId)}>
                  <Building2 className="mr-2 h-4 w-4" /> View Your Building
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start" onClick={() => router.push("/dashboard")}>
                <Gauge className="mr-2 h-4 w-4" /> Go to Dashboard
              </Button>
              {createdBuildingId && (
                <Button variant="outline" className="w-full justify-start" onClick={() => router.push("/buildings/" + createdBuildingId + "/readings")}>
                  <Zap className="mr-2 h-4 w-4" /> Add More Readings
                </Button>
              )}
            </div>
            <Button className="w-full mt-4" onClick={() => router.push(createdBuildingId ? "/buildings/" + createdBuildingId : "/dashboard")}>
              {createdBuildingId ? "View Building" : "Go to Dashboard"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
