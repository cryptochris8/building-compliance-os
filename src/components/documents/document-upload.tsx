"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, File, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadDocument } from "@/app/actions/documents";

interface DocumentUploadProps {
  buildingId: string;
  onUploadComplete?: () => void;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.csv,.xlsx";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const DOCUMENT_TYPES = [
  { value: "utility_bill", label: "Utility Bill" },
  { value: "compliance_report", label: "Compliance Report" },
  { value: "deduction_form", label: "Deduction Form" },
  { value: "other", label: "Other" },
];

export function DocumentUpload({ buildingId, onUploadComplete }: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>("utility_bill");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((selectedFile: File) => {
    setError(null);

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("File size must be under 10MB");
      return;
    }

    if (!ACCEPTED_TYPES.includes(selectedFile.type) && !selectedFile.name.match(/\.(pdf|jpe?g|png|csv|xlsx)$/i)) {
      setError("File type not accepted. Please upload PDF, JPG, PNG, CSV, or XLSX.");
      return;
    }

    setFile(selectedFile);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const storagePath = `${buildingId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file);

      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        return;
      }

      const result = await uploadDocument({
        buildingId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
        documentType: documentType as "utility_bill" | "compliance_report" | "deduction_form" | "other",
        filePath: storagePath,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setFile(null);
        onUploadComplete?.();
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        className={`border-2 border-dashed transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
      >
        <CardContent className="flex flex-col items-center justify-center py-10">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className="flex flex-col items-center gap-4 text-center"
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Drag and drop a file here, or click to select</p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG, PNG, CSV, XLSX (max 10MB)
              </p>
            </div>
            <label>
              <input
                type="file"
                className="hidden"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button variant="outline" type="button" asChild>
                <span>Select File</span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>

      {file && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <File className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {file && (
        <div className="space-y-3">
          <div>
            <Label>Document Type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((dt) => (
                  <SelectItem key={dt.value} value={dt.value}>
                    {dt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleUpload} disabled={uploading} className="w-full">
            {uploading ? "Uploading..." : "Upload Document"}
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
