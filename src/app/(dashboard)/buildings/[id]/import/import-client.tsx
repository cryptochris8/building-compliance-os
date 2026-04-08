"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { getCsvTemplateContent } from "@/lib/csv/template";

interface ImportJob {
  id: string;
  status: string;
  rowsTotal: number | null;
  rowsImported: number | null;
  rowsFailed: number | null;
  fileName: string;
}

export default function ImportClient() {
  const params = useParams();
  const buildingId = params.id as string;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDownloadTemplate = () => {
    const content = getCsvTemplateContent();
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "utility_data_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parsePreview = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const hdrs = lines[0].split(",").map((h) => h.trim());
    setHeaders(hdrs);

    const rows = lines.slice(1, 6).map((line) => line.split(",").map((c) => c.trim()));
    setPreview(rows);
  }, []);

  const handleFile = useCallback((selectedFile: File) => {
    setError(null);
    setImportJob(null);

    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please upload a CSV file.");
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parsePreview(text);
    };
    reader.readAsText(selectedFile);
  }, [parsePreview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, [handleFile]);

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/buildings/" + buildingId + "/import", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Import failed");
      } else {
        setImportJob(result);
        // Poll for status updates
        if (result.id) {
          pollJobStatus(result.id);
        }
      }
    } catch (err) {
      console.error('CSV import error:', err);
      setError("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const res = await fetch("/api/import-jobs/" + jobId);
        const job = await res.json();
        setImportJob(job);
        if (job.status === "completed" || job.status === "failed") break;
      } catch (err) {
        console.error('Import job poll failed:', err);
        break;
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Import Utility Data</h2>
          <p className="text-muted-foreground">
            Upload a CSV file to bulk import utility readings.
          </p>
        </div>
        <Button variant="outline" onClick={handleDownloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Download CSV Template
        </Button>
      </div>

      {/* Upload Area */}
      <Card
        className={"border-2 border-dashed transition-colors " +
          (dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25")}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className="flex flex-col items-center gap-4 text-center"
          >
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                Drag and drop a CSV file here, or click to select
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Only .csv files are accepted
              </p>
            </div>
            <label>
              <input
                type="file"
                className="hidden"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button variant="outline" type="button" asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Select CSV File
                </span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {file && preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview: {file.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h, i) => (
                    <TableHead key={i}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row, ri) => (
                  <TableRow key={ri}>
                    {row.map((cell, ci) => (
                      <TableCell key={ci}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-2">
              Showing first {preview.length} rows
            </p>

            <div className="mt-4">
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Start Import"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Job Status */}
      {importJob && (
        <Card>
          <CardHeader>
            <CardTitle>Import Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant={importJob.status === "completed" ? "default" : importJob.status === "failed" ? "destructive" : "secondary"}>
                {importJob.status}
              </Badge>
            </div>
            {importJob.rowsTotal !== null && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Rows</p>
                  <p className="text-lg font-bold">{importJob.rowsTotal}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Imported</p>
                  <p className="text-lg font-bold text-green-600">{importJob.rowsImported}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-lg font-bold text-red-600">{importJob.rowsFailed}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
