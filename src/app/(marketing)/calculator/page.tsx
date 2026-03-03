"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Calculator, CheckCircle2, ArrowRight, Building2 } from "lucide-react";
import { NYC_OCCUPANCY_TYPES } from "@/types";

const COEFFICIENTS = {
  electricity_kwh: 0.000288962,
  natural_gas_kbtu: 0.00005311,
  district_steam_kbtu: 0.00004493,
  fuel_oil_2_kbtu: 0.00007421,
  fuel_oil_4_kbtu: 0.00007529,
};

const LIMITS: Record<string, number> = {
  "A - Assembly": 0.01074, "B - Business": 0.00846, "E - Educational": 0.00758,
  "F - Factory": 0.00574, "H - High Hazard": 0.00574, "I-1 - Institutional": 0.01138,
  "I-2 - Institutional (Hospital)": 0.02381, "I-3 - Institutional (Detention)": 0.02381,
  "I-4 - Institutional (Day Care)": 0.01138, "M - Mercantile": 0.01181,
  "R-1 - Residential (Hotel)": 0.00987, "R-2 - Residential (Multi-family)": 0.00675,
  "S - Storage": 0.00426, "U - Utility": 0.00426,
};

const PENALTY_PER_TON = 268;

interface CalcResult { emissions: number; limit: number; surplus: number; penalty: number; status: "compliant" | "at_risk" | "over_limit"; }

function calculate(sqft: number, occupancyType: string, elecKwh: number, gasKbtu: number, steamKbtu: number, oilKbtu: number): CalcResult {
  const emissions = elecKwh * COEFFICIENTS.electricity_kwh + gasKbtu * COEFFICIENTS.natural_gas_kbtu + steamKbtu * COEFFICIENTS.district_steam_kbtu + oilKbtu * COEFFICIENTS.fuel_oil_2_kbtu;
  const limitPerSqft = LIMITS[occupancyType] ?? 0.00675;
  const limit = sqft * limitPerSqft;
  const surplus = emissions - limit;
  const penalty = surplus > 0 ? surplus * PENALTY_PER_TON : 0;
  let status: "compliant" | "at_risk" | "over_limit" = "compliant";
  if (surplus > 0) status = "over_limit";
  else if (emissions / limit > 0.9) status = "at_risk";
  return { emissions: Math.round(emissions * 10) / 10, limit: Math.round(limit * 10) / 10, surplus: Math.round(surplus * 10) / 10, penalty: Math.round(penalty), status };
}

export default function CalculatorPage() {
  const [sqft, setSqft] = useState("");
  const [occupancyType, setOccupancyType] = useState("");
  const [electricity, setElectricity] = useState("");
  const [gas, setGas] = useState("");
  const [steam, setSteam] = useState("");
  const [oil, setOil] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  function handleCalculate() {
    if (!sqft || !occupancyType) return;
    setResult(calculate(Number(sqft), occupancyType, Number(electricity || 0), Number(gas || 0) * 100, Number(steam || 0) * 1194, Number(oil || 0) * 138.5));
  }

  function handleEmailSubmit(e: React.FormEvent) { e.preventDefault(); if (email) setEmailSubmitted(true); }

  return (
    <div className="py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm text-muted-foreground mb-4">
            <Calculator className="h-3.5 w-3.5 mr-1.5 text-primary" />Free Tool &mdash; No signup required
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Free LL97 Penalty Calculator</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">Calculate your NYC Local Law 97 penalty in 30 seconds.</p>
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Building Details</CardTitle><CardDescription>Enter your building info and annual utility consumption.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label htmlFor="calc-sqft">Gross Square Footage</Label><Input id="calc-sqft" type="number" placeholder="e.g. 50000" value={sqft} onChange={(e) => setSqft(e.target.value)} /></div>
              <div className="space-y-2"><Label>Occupancy Type</Label><Select value={occupancyType} onValueChange={setOccupancyType}><SelectTrigger><SelectValue placeholder="Select occupancy type" /></SelectTrigger><SelectContent>{NYC_OCCUPANCY_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="calc-elec">Annual Electricity (kWh)</Label><Input id="calc-elec" type="number" placeholder="e.g. 600000" value={electricity} onChange={(e) => setElectricity(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="calc-gas">Annual Natural Gas (therms)</Label><Input id="calc-gas" type="number" placeholder="e.g. 36000" value={gas} onChange={(e) => setGas(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="calc-steam">District Steam (Mlb)</Label><Input id="calc-steam" type="number" placeholder="0" value={steam} onChange={(e) => setSteam(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="calc-oil">Fuel Oil #2 (gal)</Label><Input id="calc-oil" type="number" placeholder="0" value={oil} onChange={(e) => setOil(e.target.value)} /></div>
              </div>
              <Button className="w-full" onClick={handleCalculate} disabled={!sqft || !occupancyType}><Calculator className="mr-2 h-4 w-4" /> Calculate</Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {result ? (
              <>
                <Card>
                  <CardHeader><CardTitle>Results</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Estimated Emissions</span><span className="text-lg font-bold">{result.emissions.toLocaleString()} tCO2e</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Emissions Limit</span><span className="text-lg font-bold">{result.limit.toLocaleString()} tCO2e</span></div>
                    <div className="border-t pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">{result.surplus > 0 ? "Over Limit" : "Under Limit"}</span>
                        <span className={`text-lg font-bold ${result.surplus > 0 ? "text-red-600" : "text-green-600"}`}>{result.surplus > 0 ? "+" : ""}{result.surplus.toLocaleString()} tCO2e</span>
                      </div>
                    </div>
                    <div className="rounded-lg p-4 bg-muted text-center">
                      <p className="text-sm text-muted-foreground mb-1">Estimated Annual Penalty</p>
                      <p className={`text-3xl font-bold ${result.penalty > 0 ? "text-red-600" : "text-green-600"}`}>${result.penalty.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">at $268 per tCO2e over limit</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.status === "over_limit" && (<Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Over Limit</Badge>)}
                      {result.status === "at_risk" && (<Badge variant="secondary" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> At Risk</Badge>)}
                      {result.status === "compliant" && (<Badge variant="default" className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Compliant</Badge>)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Get Your Full Compliance Report</CardTitle><CardDescription>Enter your email to receive a detailed PDF report.</CardDescription></CardHeader>
                  <CardContent>
                    {emailSubmitted ? (
                      <div className="text-center py-4"><CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" /><p className="font-medium">Thank you!</p><p className="text-sm text-muted-foreground">We will send your report shortly.</p></div>
                    ) : (
                      <form onSubmit={handleEmailSubmit} className="flex gap-2"><Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" required /><Button type="submit">Send Report</Button></form>
                    )}
                  </CardContent>
                </Card>
                <Card className="bg-primary text-primary-foreground">
                  <CardContent className="py-6 text-center">
                    <p className="font-semibold text-lg mb-2">Want to track compliance for your whole portfolio?</p>
                    <p className="text-sm opacity-90 mb-4">Sign up free and add all your buildings.</p>
                    <Link href="/signup" className="inline-flex items-center justify-center rounded-md bg-white text-primary px-6 py-2.5 text-sm font-medium shadow hover:bg-white/90 transition-colors">Sign Up Free <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Calculator className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold">Enter your building data</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">Fill in the form and click Calculate to see your LL97 compliance status.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
