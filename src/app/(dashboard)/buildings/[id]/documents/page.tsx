"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, FileText, Trash2, Download, Image as ImageIcon, Eye } from "lucide-react";
import { DocumentUpload } from "@/components/documents/document-upload";
import { deleteDocument } from "@/app/actions/documents";

interface DocumentRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number | null;
  documentType: string | null;
  createdAt: string;
  complianceYear?: number | null;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  utility_bill: "Utility Bill",
  compliance_report: "Compliance Report",
  deduction_form: "Deduction Form",
  other: "Other",
};

const DEMO_DOCUMENTS: DocumentRecord[] = [
  { id: "1", fileName: "con_edison_jan_2024.pdf", fileType: "application/pdf", fileSizeBytes: 245000, documentType: "utility_bill", createdAt: "2024-02-15T10:30:00Z", complianceYear: 2024 },
  { id: "2", fileName: "national_grid_jan_2024.pdf", fileType: "application/pdf", fileSizeBytes: 198000, documentType: "utility_bill", createdAt: "2024-02-15T10:31:00Z", complianceYear: 2024 },
  { id: "3", fileName: "ll97_compliance_2023.pdf", fileType: "application/pdf", fileSizeBytes: 1200000, documentType: "compliance_report", createdAt: "2024-05-01T14:00:00Z", complianceYear: 2023 },
  { id: "4", fileName: "solar_panel_photo.jpg", fileType: "image/jpeg", fileSizeBytes: 3500000, documentType: "deduction_form", createdAt: "2024-06-15T09:00:00Z", complianceYear: 2024 },
];

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function isImageFile(fileType: string): boolean {
  return fileType.startsWith("image/");
}

export default function DocumentsPage() {
  const params = useParams();
  const buildingId = params.id as string;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const documents = DEMO_DOCUMENTS;

  const filtered = useMemo(() => {
    let docs = documents;
    if (typeFilter !== "all") docs = docs.filter((d) => d.documentType === typeFilter);
    if (yearFilter !== "all") docs = docs.filter((d) => String(d.complianceYear) === yearFilter);
    return docs;
  }, [documents, typeFilter, yearFilter]);

  // Count per type and year
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of documents) {
      const key = d.documentType || "other";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [documents]);

  const yearCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of documents) {
      const key = String(d.complianceYear || "none");
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [documents]);

  const uniqueYears = [...new Set(documents.map((d) => d.complianceYear).filter(Boolean))].sort();

  const handleDelete = async (docId: string) => {
    if (confirm("Are you sure you want to delete this document?")) {
      await deleteDocument(docId, buildingId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Evidence Vault</h2>
          <p className="text-muted-foreground">
            Upload and manage supporting documents for compliance reporting.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Upload Document</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
            <DocumentUpload buildingId={buildingId} onUploadComplete={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(typeCounts).map(([type, count]) => (
          <Badge key={type} variant="outline" className="cursor-pointer" onClick={() => setTypeFilter(type)}>
            {DOCUMENT_TYPE_LABELS[type] || type}: {count}
          </Badge>
        ))}
        {Object.entries(yearCounts).map(([year, count]) => (
          <Badge key={year} variant="secondary" className="cursor-pointer" onClick={() => setYearFilter(year)}>
            {year}: {count}
          </Badge>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Document type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="utility_bill">Utility Bill</SelectItem>
            <SelectItem value="compliance_report">Compliance Report</SelectItem>
            <SelectItem value="deduction_form">Deduction Form</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Compliance year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {uniqueYears.map((y) => (
              <SelectItem key={String(y)} value={String(y)}>{String(y)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(typeFilter !== "all" || yearFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setTypeFilter("all"); setYearFilter("all"); }}>
            Clear Filters
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Documents ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No documents found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isImageFile(doc.fileType) ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                        {doc.fileName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {DOCUMENT_TYPE_LABELS[doc.documentType || "other"] || doc.documentType}
                      </Badge>
                    </TableCell>
                    <TableCell>{doc.complianceYear || "-"}</TableCell>
                    <TableCell>{formatFileSize(doc.fileSizeBytes)}</TableCell>
                    <TableCell>{formatDate(doc.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {isImageFile(doc.fileType) && (
                          <Button variant="ghost" size="icon" onClick={() => setPreviewDoc(doc)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" asChild>
                          <a href={"#download-" + doc.id} title="Download">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{previewDoc.fileName}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center p-4 bg-muted rounded">
              <p className="text-sm text-muted-foreground">
                Image preview would appear here (requires Supabase Storage integration)
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
