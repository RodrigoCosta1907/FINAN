"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportButton({
  rows,
  filename,
}: {
  rows: Array<[string, string]>;
  filename: string;
}) {
  function download() {
    const csv = ["indicador;valor", ...rows.map(([k, v]) => `${k};${v}`)].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={download}>
      <Download className="h-3.5 w-3.5" />
      Exportar
    </Button>
  );
}
