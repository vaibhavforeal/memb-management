"use client";
import { useState, useTransition } from "react";
import Papa from "papaparse";
import { FileSpreadsheet, Upload } from "lucide-react";
import { memberInput, type MemberInput } from "@/lib/domain";
import { mutate } from "@/app/actions";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
export function ImportMembers() {
  const [rows, setRows] = useState<MemberInput[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [result, setResult] = useState(""),
    [pending, startTransition] = useTransition();
  function fileSelected(file?: File) {
    setRows([]);
    setErrors([]);
    setResult("");
    if (!file) return;
    if (file.size > 2_000_000) {
      setErrors(["The CSV must be smaller than 2 MB."]);
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (r) => {
        const errs = r.errors.map(
            (e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`,
          ),
          valid: MemberInput[] = [],
          seen = new Set<string>();
        if (
          !r.meta.fields?.includes("name") ||
          !r.meta.fields?.includes("phone")
        )
          errs.push(
            "CSV headers must include name and phone. Optional: email, notes.",
          );
        if (r.data.length > 2000)
          errs.push("Import up to 2,000 rows at a time.");
        r.data.forEach((row, i) => {
          const parsed = memberInput.safeParse({
            name: row.name ?? "",
            phone: row.phone ?? "",
            email: row.email ?? "",
            notes: row.notes ?? "",
          });
          if (!parsed.success)
            errs.push(
              `Row ${i + 2}: ${parsed.error.issues.map((e) => e.message).join(" ")}`,
            );
          else {
            const key = parsed.data.name.toLowerCase() + parsed.data.phone;
            if (seen.has(key))
              errs.push(`Row ${i + 2}: Duplicate name and phone.`);
            seen.add(key);
            valid.push(parsed.data);
          }
        });
        setRows(valid);
        setErrors(errs);
      },
    });
  }
  function commit() {
    startTransition(async () => {
      const f = new FormData();
      f.set("_action", "import");
      f.set("rows", JSON.stringify(rows));
      const r = await mutate({ ok: false, message: "" }, f);
      setResult(r.message);
      if (r.ok) setRows([]);
      else setErrors([r.message]);
    });
  }
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="mb-3 flex items-start gap-3">
          <span className="rounded-lg bg-primary/10 p-3 text-primary">
            <FileSpreadsheet size={22} />
          </span>
          <div>
            <h2 className="font-medium">Upload CSV</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Required columns: name, phone. Optional: email, notes. Duplicates
              are skipped.
            </p>
          </div>
        </div>
        <a
          href="/member-import-template.csv"
          download
          className="mb-3 inline-block text-xs text-primary underline underline-offset-4"
        >
          Download the CSV template
        </a>
        <label className="field">
          Choose CSV file
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => fileSelected(e.target.files?.[0])}
            className="h-auto py-2 sm:h-auto"
          />
        </label>
      </Card>
      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
        >
          <p className="mb-2 font-medium">Fix these issues before importing:</p>
          <ul className="list-inside list-disc space-y-1">
            {errors.slice(0, 20).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {errors.length > 20 && (
            <p className="mt-2">And {errors.length - 20} more issues.</p>
          )}
        </div>
      )}
      {result && !errors.length && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary"
        >
          {result}
        </p>
      )}
      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-3">
            <h2 className="text-sm font-semibold">
              Preview · {rows.length} rows
            </h2>
            <Button onClick={commit} disabled={pending || errors.length > 0}>
              <Upload />
              {pending ? "Importing…" : `Import ${rows.length} members`}
            </Button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.phone}</td>
                    <td>{r.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 20 && (
            <p className="p-3 text-xs text-muted-foreground">
              Showing the first 20 rows. All {rows.length} valid rows will be
              imported.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
