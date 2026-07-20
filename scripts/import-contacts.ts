import { parseArgs } from "node:util";
import path from "node:path";
import ExcelJS from "exceljs";
import { repositories } from "@/lib/services/repositories";
import { isDbConfigured } from "@/lib/db/client";

/**
 * Imports APPROVED contacts from the human-reviewed Excel
 * (`docs/contactos-printing/contactos-limpios.xlsx` by default, produced by
 * `scripts/clean-contacts.mjs` and then hand-edited) into one or more
 * businesses' customers. Fase 2.1 — only run AFTER the user approves the
 * Excel (flips `Incluir` per row as needed).
 *
 * Usage (each sede gets the SAME approved contacts inserted as its own
 * separate customer rows):
 *
 *   npx tsx --env-file=.env.local scripts/import-contacts.ts \
 *     --business-id be61779d-4961-4f1e-8ee8-1aed3e1a5c23 \
 *     --business-id e7ec1a11-cbd6-406f-8fa6-6aef7cb2e3ee
 *
 * Optional flags:
 *   --file <path>   Override the input workbook (default: the path above).
 *   --dry-run       Parse + report only; inserts nothing.
 *
 * REPO-REUSE APPROACH (same as `scripts/seed-demo.ts`): goes through
 * `repositories.customers.create` / `repositories.business.getById` — the
 * exact wiring point the app itself uses — rather than raw SQL, so this
 * script never has to hand-replicate the customers table shape or any
 * future invariants added to the repo layer.
 *
 * Idempotency: safe to re-run. Before inserting, existing customers for each
 * business are loaded and used to skip contacts already present (matched by
 * lowercased email when the contact has one, else by lowercased name).
 */

const DEFAULT_FILE = path.join("docs", "contactos-printing", "contactos-limpios.xlsx");

// Columns are looked up BY HEADER NAME (row 1), not fixed index, so the
// script tolerates column reordering in the reviewed sheet.
const REQUIRED_HEADERS = ["Incluir", "Nombre", "Empresa", "Email", "Teléfono"] as const;

const INCLUDE_YES_VALUES = new Set(["si", "sí", "x", "true", "1", "yes"]);

type ParsedContact = {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type ParseResult = {
  approved: ParsedContact[];
  totalRows: number;
  skippedNotIncluded: number;
  skippedNoData: number;
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // Hyperlink / rich-text cells: exceljs returns `{ text }` or
    // `{ richText: [...] }` shapes instead of a plain string.
    const maybe = value as { text?: unknown; richText?: { text?: string }[]; result?: unknown };
    if (typeof maybe.text === "string") return maybe.text;
    if (Array.isArray(maybe.richText)) return maybe.richText.map((r) => r.text ?? "").join("");
    if (maybe.result !== undefined && maybe.result !== null) return String(maybe.result);
    return "";
  }
  return String(value).trim();
}

function isIncluded(rawValue: string): boolean {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "") return false;
  return INCLUDE_YES_VALUES.has(normalized);
}

async function parseWorkbook(filePath: string): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error(`[import-contacts] Workbook "${filePath}" has no worksheets.`);
  }

  const headerRow = sheet.getRow(1);
  const headerIndex = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const header = cellText(cell.value).trim();
    if (header) headerIndex.set(header, colNumber);
  });

  for (const required of REQUIRED_HEADERS) {
    if (!headerIndex.has(required)) {
      throw new Error(`[import-contacts] Expected column not found in header: "${required}"`);
    }
  }

  const col = (name: (typeof REQUIRED_HEADERS)[number]) => headerIndex.get(name)!;

  const approved: ParsedContact[] = [];
  let totalRows = 0;
  let skippedNotIncluded = 0;
  let skippedNoData = 0;

  const lastRow = sheet.rowCount;
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const isFullyEmpty = row.actualCellCount === 0;
    if (isFullyEmpty) continue;

    totalRows++;

    const incluirRaw = cellText(row.getCell(col("Incluir")).value);
    if (!isIncluded(incluirRaw)) {
      skippedNotIncluded++;
      continue;
    }

    const nombre = cellText(row.getCell(col("Nombre")).value);
    const empresa = cellText(row.getCell(col("Empresa")).value);
    const email = cellText(row.getCell(col("Email")).value);
    const telefono = cellText(row.getCell(col("Teléfono")).value);

    const name = empresa || nombre;
    if (!name) {
      skippedNoData++;
      continue;
    }

    const notes = empresa && nombre ? `Contacto: ${nombre}` : null;

    approved.push({
      name,
      email: email || null,
      phone: telefono || null,
      notes,
    });
  }

  return { approved, totalRows, skippedNotIncluded, skippedNoData };
}

/** Builds the existing-customer dedup key set for one business (lowercased email when present, else lowercased name). */
async function loadExistingKeys(businessId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const pageSize = 100000;
  const page = await repositories.customers.list(businessId, { page: 1, pageSize });
  for (const customer of page.data) {
    const key = customer.email ? `email:${customer.email.toLowerCase()}` : `name:${customer.name.toLowerCase()}`;
    keys.add(key);
  }
  return keys;
}

function contactKey(contact: ParsedContact): string {
  return contact.email ? `email:${contact.email.toLowerCase()}` : `name:${contact.name.toLowerCase()}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "business-id": { type: "string", multiple: true },
      file: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const businessIds = values["business-id"] ?? [];
  if (businessIds.length === 0) {
    console.error(
      "[import-contacts] Missing --business-id <uuid>. Provide at least one (repeatable for multiple sedes)."
    );
    process.exit(1);
  }

  const filePath = values.file ?? DEFAULT_FILE;
  const dryRun = values["dry-run"] ?? false;

  if (!dryRun && !isDbConfigured) {
    console.error("[import-contacts] No database configured (POSTGRES_URL/DATABASE_URL missing). Aborting.");
    process.exit(1);
  }

  console.log(`[import-contacts] Reading "${filePath}"...`);
  const { approved, totalRows, skippedNotIncluded, skippedNoData } = await parseWorkbook(filePath);
  console.log(
    `[import-contacts] Parsed ${totalRows} data row(s): ${approved.length} approved, ` +
      `${skippedNotIncluded} not included, ${skippedNoData} skipped (no usable data).`
  );

  if (dryRun) {
    console.log("[import-contacts] --dry-run: no database writes will be made.");
  }

  let grandInserted = 0;
  let grandSkippedExisting = 0;

  for (const businessId of businessIds) {
    if (!dryRun) {
      const business = await repositories.business.getById(businessId);
      if (!business) {
        console.error(`[import-contacts] Business ${businessId} does not exist. Aborting.`);
        process.exit(1);
      }

      console.log(`\n[import-contacts] Importing into business "${business.name}" (${businessId})...`);

      const existingKeys = await loadExistingKeys(businessId);
      let inserted = 0;
      let skippedExisting = 0;

      for (const contact of approved) {
        const key = contactKey(contact);
        if (existingKeys.has(key)) {
          skippedExisting++;
          continue;
        }

        await repositories.customers.create(businessId, {
          name: contact.name,
          documentNumber: null,
          email: contact.email,
          phone: contact.phone,
          address: null,
          notes: contact.notes,
        });
        existingKeys.add(key);
        inserted++;
      }

      console.log(
        `[import-contacts]   ${business.name}: inserted=${inserted}, skipped-existing=${skippedExisting}, ` +
          `total-in-sheet-approved=${approved.length}`
      );

      grandInserted += inserted;
      grandSkippedExisting += skippedExisting;
    } else {
      console.log(
        `\n[import-contacts] [dry-run] Would import ${approved.length} approved contact(s) into business ${businessId}.`
      );
    }
  }

  if (!dryRun) {
    console.log(
      `\n[import-contacts] Done. Grand total: inserted=${grandInserted}, skipped-existing=${grandSkippedExisting} ` +
        `across ${businessIds.length} business(es).`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[import-contacts] Failed:", error);
    process.exit(1);
  });
