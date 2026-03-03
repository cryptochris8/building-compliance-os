"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  connectPM, disconnectPM, syncPMProperties,
  linkProperty, unlinkProperty, importMeterData,
  getPMConnection, getPMPropertyMappings, getOrgBuildings,
} from "@/app/actions/portfolio-manager";

interface PMConnection { id: string; pmUsername: string; connectedAt: Date | null; lastSyncAt: Date | null; }
interface PMMapping { id: string; pmPropertyId: string; pmPropertyName: string | null; buildingId: string | null; linkedAt: Date | null; }
interface OrgBuilding { id: string; name: string; addressLine1: string; }

export default function PortfolioManagerSettingsPage() {
  const [connection, setConnection] = useState<PMConnection | null>(null);
  const [mappings, setMappings] = useState<PMMapping[]>([]);
  const [orgBuildings, setOrgBuildings] = useState<OrgBuilding[]>([]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [conn, maps, blds] = await Promise.all([getPMConnection(), getPMPropertyMappings(), getOrgBuildings()]);
      setConnection(conn); setMappings(maps); setOrgBuildings(blds); setLoading(false);
    }
    load();
  }, []);

  const handleConnect = async (formData: FormData) => {
    startTransition(async () => {
      const result = await connectPM(formData);
      if (result.error) { setMessage("Error: " + result.error); }
      else { setMessage("Connected!"); const c = await getPMConnection(); setConnection(c); }
    });
  };

  const handleDisconnect = () => {
    startTransition(async () => { await disconnectPM(); setConnection(null); setMappings([]); setMessage("Disconnected."); });
  };

  const handleSync = () => {
    startTransition(async () => {
      const result = await syncPMProperties();
      if (result.error) { setMessage("Sync error: " + result.error); }
      else { setMessage("Synced " + result.count + " properties."); const m = await getPMPropertyMappings(); setMappings(m); }
    });
  };

  const handleLink = (pmPropId: string, bldId: string) => {
    startTransition(async () => {
      const r = await linkProperty(pmPropId, bldId);
      if (r.error) { setMessage("Link error: " + r.error); }
      else { const m = await getPMPropertyMappings(); setMappings(m); setMessage("Linked."); }
    });
  };

  const handleUnlink = (pmPropId: string) => {
    startTransition(async () => {
      const r = await unlinkProperty(pmPropId);
      if (r.error) { setMessage("Unlink error: " + r.error); }
      else { const m = await getPMPropertyMappings(); setMappings(m); setMessage("Unlinked."); }
    });
  };

  const handleImport = (pmPropId: string, bldId: string) => {
    startTransition(async () => {
      const r = await importMeterData(pmPropId, bldId);
      if (r.error) { setMessage("Import error: " + r.error); }
      else { setMessage("Imported " + r.imported + " readings from " + r.meters + " meters."); }
    });
  };

  if (loading) return (<div className="space-y-6"><div><h2 className="text-3xl font-bold tracking-tight">Portfolio Manager</h2><p className="text-muted-foreground">Loading...</p></div></div>);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Portfolio Manager</h2>
        <p className="text-muted-foreground">Connect your EPA ENERGY STAR Portfolio Manager account to import building data.</p>
      </div>

      {message && <div className="bg-muted p-3 rounded-md text-sm">{message}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Connection Status
            {connection ? <Badge variant="default">Connected</Badge> : <Badge variant="secondary">Not Connected</Badge>}
          </CardTitle>
          <CardDescription>
            {connection ? "Connected as " + connection.pmUsername : "Enter your Portfolio Manager credentials to connect."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connection ? (
            <div className="flex gap-3">
              <Button onClick={handleSync} disabled={isPending}>{isPending ? "Syncing..." : "Sync Properties"}</Button>
              <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>Disconnect</Button>
            </div>
          ) : (
            <form action={handleConnect} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="username">PM Username</Label>
                <Input id="username" name="username" required placeholder="your-pm-username" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">PM Password</Label>
                <Input id="password" name="password" type="password" required placeholder="your-pm-password" />
              </div>
              <Button type="submit" disabled={isPending}>{isPending ? "Connecting..." : "Connect"}</Button>
            </form>
          )}
        </CardContent>
      </Card>

      {mappings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Property Mappings</CardTitle>
            <CardDescription>Link Portfolio Manager properties to your buildings.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mappings.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{m.pmPropertyName || "PM Property " + m.pmPropertyId}</p>
                    <p className="text-sm text-muted-foreground">PM ID: {m.pmPropertyId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.buildingId ? (
                      <>
                        <Badge variant="default">Linked</Badge>
                        <Button size="sm" variant="outline" onClick={() => handleImport(m.pmPropertyId, m.buildingId!)} disabled={isPending}>Import Data</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleUnlink(m.pmPropertyId)} disabled={isPending}>Unlink</Button>
                      </>
                    ) : (
                      <select className="border rounded px-2 py-1 text-sm" defaultValue="" onChange={(e) => { if (e.target.value) handleLink(m.pmPropertyId, e.target.value); }} disabled={isPending}>
                        <option value="">Link to building...</option>
                        {orgBuildings.map((b) => (<option key={b.id} value={b.id}>{b.name} - {b.addressLine1}</option>))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
