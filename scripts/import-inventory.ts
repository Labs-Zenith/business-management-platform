import { parseArgs } from "node:util";
import ExcelJS from "exceljs";
import { repositories } from "@/lib/services/repositories";
import { isDbConfigured } from "@/lib/db/client";

/**
 * Imports an inventory Excel sheet into ONE business: creates a `product`
 * per data row and, when the row has a positive quantity, an initial `in`
 * `inventory_movement` to seed its stock (stock is a derived ledger sum —
 * there is no "set stock" — see `lib/services/inventory-service.ts`).
 *
 * Usage:
 *
 *   npx tsx --env-file=.env.local scripts/import-inventory.ts \
 *     --business-id <uuid> --file docs/inventario/Inventario_LCH.xlsx
 *
 * Optional flags:
 *   --dry-run   Parse + report only (counts + first ~10 names w/ qty); no
 *               database reads/writes are made at all.
 *
 * REPO-REUSE APPROACH (same as `scripts/seed-demo.ts` / `import-contacts.ts`):
 * goes through `repositories.products.create` / `repositories.inventory.create`
 * — the exact wiring point the app itself uses — so this script never has to
 * hand-replicate the products/inventory_movements table shape or the
 * floor-at-zero guard.
 *
 * ONE SCRIPT, TWO LAYOUTS: columns are looked up BY HEADER NAME, not fixed
 * index, so the same script handles both real files without branching:
 *   - `Inventario_LCH (1).xlsx`     — sheet "Inventario", header row 2:
 *     `Producto`, `Cantidad` (data rows 3+; row 1 is a title banner).
 *   - `Inventario_Kahalaa_BQ (1).xlsx` — sheet "Inventario", header row 2:
 *     `Categoria`, `Producto`, `Color / Variante`, `Talla`, `Cantidad`,
 *     `Observaciones` (data rows 3+). This workbook also has a "Resumen"
 *     sheet (category totals) which is IGNORED — only the "Inventario"
 *     sheet is read.
 * The header row itself is auto-detected by scanning the first rows of the
 * "Inventario" sheet for one that contains a "Producto" cell, so neither the
 * exact row number nor column order is hardcoded.
 *
 * Naming for variant rows (when `Talla`/`Color / Variante` columns exist):
 * `name = Producto [+ " · Talla " + Talla] [+ " · " + Color]` (each segment
 * only appended when the value is present and isn't a "-" placeholder).
 *
 * Notes/category: `ProductCreate` (`lib/services/ports.ts`) has NO `notes`
 * field — `products` only stores `name`/`sku`/`unitCost`/`active`. So
 * `Categoria`/`Observaciones` context is intentionally NOT persisted (folding
 * it into `name` would break the clean product name shown in the UI and used
 * for dedup); this script just counts and reports how many rows had that
 * context so nothing is silently lost from view.
 *
 * Idempotency: safe to re-run. Before inserting, existing products for the
 * business are loaded and matched by lowercased `name` to skip rows whose
 * derived name already exists.
 */

const INVENTORY_SHEET_NAME = "inventario";

type ParsedRow = {
  name: string;
  quantity: number;
  hasDroppedNotes: boolean;
};

type ParseResult = {
  rows: ParsedRow[];
  totalDataRows: number;
  skippedEmpty: number;
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // Hyperlink / rich-text / formula-result cells: exceljs returns
    // `{ text }`, `{ richText: [...] }`, or `{ result }` shapes instead of a
    // plain string/number.
    const maybe = value as { text?: unknown; richText?: { text?: string }[]; result?: unknown };
    if (typeof maybe.text === "string") return maybe.text;
    if (Array.isArray(maybe.richText)) return maybe.richText.map((r) => r.text ?? "").join("");
    if (maybe.result !== undefined && maybe.result !== null) return String(maybe.result).trim();
    return "";
  }
  return String(value).trim();
}

/** Lowercases, strips accents, and removes whitespace so header lookups tolerate accents/spacing differences ("Categoría" vs "Categoria", "Color / Variante" vs "Color/Variante"). */
function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function findInventorySheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.worksheets.find((ws) => normalizeHeader(ws.name) === INVENTORY_SHEET_NAME);
  if (!sheet) {
    throw new Error(
      `[import-inventory] No "Inventario" worksheet found. Available sheets: ${workbook.worksheets
        .map((ws) => ws.name)
        .join(", ")}`
    );
  }
  return sheet;
}

/** Scans the first rows for one containing a "Producto" cell — that's the header row, regardless of banner rows above it. */
function findHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; index: Map<string, number> } {
  const maxScanRows = Math.min(sheet.rowCount, 10);
  for (let rowNumber = 1; rowNumber <= maxScanRows; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const candidateIndex = new Map<string, number>();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell.value);
      if (text) candidateIndex.set(normalizeHeader(text), colNumber);
    });
    if (candidateIndex.has("producto")) {
      return { rowNumber, index: candidateIndex };
    }
  }
  throw new Error(`[import-inventory] Could not find a header row containing "Producto" in sheet "${sheet.name}".`);
}

function parseWorkbook(sheet: ExcelJS.Worksheet): ParseResult {
  const { rowNumber: headerRowNumber, index: headerIndex } = findHeaderRow(sheet);

  const productCol = headerIndex.get("producto");
  if (!productCol) {
    throw new Error(`[import-inventory] Header row ${headerRowNumber} has no "Producto" column.`);
  }
  const cantidadCol = headerIndex.get("cantidad");
  const tallaCol = headerIndex.get("talla");
  const colorCol = headerIndex.get("color/variante");
  const categoriaCol = headerIndex.get("categoria");
  const observacionesCol = headerIndex.get("observaciones");

  const rows: ParsedRow[] = [];
  let totalDataRows = 0;
  let skippedEmpty = 0;

  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.actualCellCount === 0) continue;

    const producto = cellText(row.getCell(productCol).value);
    if (!producto) {
      skippedEmpty++;
      continue;
    }

    totalDataRows++;

    let name = producto;
    if (tallaCol) {
      const talla = cellText(row.getCell(tallaCol).value);
      if (talla && talla !== "-") name += ` · Talla ${talla}`;
    }
    if (colorCol) {
      const color = cellText(row.getCell(colorCol).value);
      if (color && color !== "-") name += ` · ${color}`;
    }

    let quantity = 1;
    if (cantidadCol) {
      const rawQty = cellText(row.getCell(cantidadCol).value);
      if (rawQty !== "") {
        const parsed = Math.trunc(Number(rawQty));
        quantity = Number.isFinite(parsed) ? parsed : 1;
      }
    }

    let hasDroppedNotes = false;
    if (categoriaCol && cellText(row.getCell(categoriaCol).value)) hasDroppedNotes = true;
    if (observacionesCol && cellText(row.getCell(observacionesCol).value)) hasDroppedNotes = true;

    rows.push({ name, quantity, hasDroppedNotes });
  }

  return { rows, totalDataRows, skippedEmpty };
}

/** Builds the existing-product dedup key set for one business (lowercased name). */
async function loadExistingNames(businessId: string): Promise<Set<string>> {
  const names = new Set<string>();
  const page = await repositories.products.list(businessId, { page: 1, pageSize: 100000 });
  for (const product of page.data) {
    names.add(product.name.toLowerCase());
  }
  return names;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "business-id": { type: "string" },
      file: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const businessId = values["business-id"];
  const filePath = values.file;
  const dryRun = values["dry-run"] ?? false;

  if (!businessId || !filePath) {
    console.error("[import-inventory] Missing required flags. Usage:");
    console.error(
      "  npx tsx --env-file=.env.local scripts/import-inventory.ts --business-id <uuid> --file <path.xlsx> [--dry-run]"
    );
    process.exit(1);
  }

  console.log(`[import-inventory] Reading "${filePath}"...`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = findInventorySheet(workbook);
  const { rows, totalDataRows, skippedEmpty } = parseWorkbook(sheet);
  const droppedNotesCount = rows.filter((r) => r.hasDroppedNotes).length;

  console.log(
    `[import-inventory] Parsed ${totalDataRows} data row(s) from sheet "${sheet.name}" ` +
      `(${skippedEmpty} skipped — no "Producto" value).`
  );
  if (droppedNotesCount > 0) {
    console.log(
      `[import-inventory] Note: ${droppedNotesCount} row(s) have Categoria/Observaciones context that is NOT ` +
        `persisted (products has no "notes" field).`
    );
  }

  if (dryRun) {
    console.log("[import-inventory] --dry-run: no database reads/writes will be made.");
    console.log(`[import-inventory] Would create up to ${rows.length} product(s). First ${Math.min(10, rows.length)}:`);
    for (const row of rows.slice(0, 10)) {
      console.log(`  - "${row.name}" x${row.quantity}`);
    }
    return;
  }

  if (!isDbConfigured) {
    console.error("[import-inventory] No database configured (POSTGRES_URL/DATABASE_URL missing). Aborting.");
    process.exit(1);
  }

  const business = await repositories.business.getById(businessId);
  if (!business) {
    console.error(`[import-inventory] Business ${businessId} does not exist. Aborting.`);
    process.exit(1);
  }

  console.log(`[import-inventory] Importing into business "${business.name}" (${businessId})...`);

  const existingNames = await loadExistingNames(businessId);
  let created = 0;
  let skippedExisting = 0;
  let totalUnitsAdded = 0;

  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (existingNames.has(key)) {
      skippedExisting++;
      continue;
    }

    const product = await repositories.products.create(businessId, {
      name: row.name,
      unitCost: 0,
    });
    existingNames.add(key);
    created++;

    if (row.quantity > 0) {
      await repositories.inventory.create(businessId, {
        productId: product.id,
        type: "in",
        quantity: row.quantity,
        note: "Carga inicial",
      });
      totalUnitsAdded += row.quantity;
    }
  }

  console.log("[import-inventory] Done. Summary:");
  console.log(`  rows read:           ${totalDataRows}`);
  console.log(`  products created:    ${created}`);
  console.log(`  skipped (existing):  ${skippedExisting}`);
  console.log(`  total units added:   ${totalUnitsAdded}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[import-inventory] Failed:", error);
    process.exit(1);
  });
