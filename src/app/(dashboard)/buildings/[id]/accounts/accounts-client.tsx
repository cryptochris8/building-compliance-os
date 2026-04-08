"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  getUtilityAccountsForBuilding,
  createUtilityAccount,
  updateUtilityAccount,
  deleteUtilityAccount,
} from "@/app/actions/utility-accounts";
import { ConfirmDialog, useConfirmDialog } from "@/components/ui/confirm-dialog";
import { UTILITY_TYPE_LABELS } from "@/lib/utils/utility-labels";

const UTILITY_TYPES = [
  { value: "electricity", label: "Electricity" },
  { value: "natural_gas", label: "Natural Gas" },
  { value: "district_steam", label: "District Steam" },
  { value: "fuel_oil_2", label: "Fuel Oil #2" },
  { value: "fuel_oil_4", label: "Fuel Oil #4" },
];

interface Account {
  id: string;
  accountNumber: string | null;
  utilityType: string;
  providerName: string | null;
}

export default function AccountsClient() {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.id as string;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [confirmProps, showConfirm] = useConfirmDialog();

  // Form state
  const [formType, setFormType] = useState("electricity");
  const [formNumber, setFormNumber] = useState("");
  const [formProvider, setFormProvider] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = async () => {
    const result = await getUtilityAccountsForBuilding(buildingId);
    if (result.accounts) setAccounts(result.accounts);
    setLoading(false);
  };

  useEffect(() => { loadAccounts(); }, [buildingId]);

  const resetForm = () => {
    setFormType("electricity");
    setFormNumber("");
    setFormProvider("");
    setEditingAccount(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (account: Account) => {
    setEditingAccount(account);
    setFormType(account.utilityType);
    setFormNumber(account.accountNumber || "");
    setFormProvider(account.providerName || "");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingAccount) {
        const result = await updateUtilityAccount(editingAccount.id, {
          buildingId,
          utilityType: formType as "electricity" | "natural_gas" | "district_steam" | "fuel_oil_2" | "fuel_oil_4",
          accountNumber: formNumber,
          providerName: formProvider,
        });
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Account updated");
          setDialogOpen(false);
          resetForm();
          await loadAccounts();
        }
      } else {
        const result = await createUtilityAccount({
          buildingId,
          utilityType: formType as "electricity" | "natural_gas" | "district_steam" | "fuel_oil_2" | "fuel_oil_4",
          accountNumber: formNumber,
          providerName: formProvider,
        });
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Account created");
          setDialogOpen(false);
          resetForm();
          await loadAccounts();
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (account: Account) => {
    showConfirm({
      title: "Delete Utility Account",
      description: "Delete the " + (UTILITY_TYPE_LABELS[account.utilityType] || account.utilityType) + " account" + (account.accountNumber ? " (" + account.accountNumber + ")" : "") + "? All readings associated with this account will also be deleted.",
      onConfirm: async () => {
        const result = await deleteUtilityAccount(account.id, buildingId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Account deleted");
          await loadAccounts();
        }
      },
    });
  };

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Loading utility accounts...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Utility Accounts</h2>
          <p className="text-muted-foreground">
            Manage utility meter accounts for this building. Each account represents a meter or utility service.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts ({accounts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No utility accounts yet. Add an account for each utility meter (electricity, gas, etc.) to start tracking readings.
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Account
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utility Type</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {UTILITY_TYPE_LABELS[account.utilityType] || account.utilityType}
                      </Badge>
                    </TableCell>
                    <TableCell>{account.accountNumber || "—"}</TableCell>
                    <TableCell>{account.providerName || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(account)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(account)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Utility Account" : "Add Utility Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Utility Type</Label>
              <Select value={formType} onValueChange={setFormType} disabled={!!editingAccount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UTILITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-number">Account Number (optional)</Label>
              <Input id="acc-number" placeholder="e.g. ACCT-12345" value={formNumber} onChange={(e) => setFormNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-provider">Provider Name (optional)</Label>
              <Input id="acc-provider" placeholder="e.g. Con Edison" value={formProvider} onChange={(e) => setFormProvider(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving..." : editingAccount ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
