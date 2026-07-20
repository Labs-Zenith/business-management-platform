#!/usr/bin/env node
/**
 * Cleans a Google Contacts CSV export and produces an Excel workbook for
 * human review. Pure file I/O — no database, no network.
 *
 * Usage: node scripts/clean-contacts.mjs
 *
 * Input:  docs/contactos-printing/contacts (2).csv
 * Output: docs/contactos-printing/contactos-limpios.xlsx
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT_PATH = path.join(ROOT, "docs/contactos-printing/contacts (2).csv");
const OUTPUT_PATH = path.join(ROOT, "docs/contactos-printing/contactos-limpios.xlsx");

// ---------------------------------------------------------------------------
// Quote-aware CSV parser (RFC 4180-ish): handles quoted fields containing
// commas/newlines and doubled `""` escapes. Written inline because neither
// csv-parse nor papaparse is a project dependency.
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // Skip bare CR; paired with the following \n below.
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  // Flush a trailing field/row that has no terminating newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Name intelligibility heuristic
// ---------------------------------------------------------------------------

// Characters allowed to survive as "signal" inside a name: letters (any
// script, so accented/stylized-unicode names count), combining marks
// (diacritics), spaces, periods, hyphens, apostrophes. Everything else
// (digits, @, :, *, ~, bullets, emoji, etc.) is decoration/junk and stripped.
const STRIP_DECORATION_REGEX = /[^\p{L}\p{M}\s.\-']/gu;
const VOWEL_REGEX = /[aeiouyáéíóúüàèìòùâêîôûäëïöñ]/i;
const REPEATED_RUN_REGEX = /(.)\1{2,}/; // same char 3+ times in a row, e.g. "nnn", "..."

function countLetters(token) {
  return (token.match(/\p{L}/gu) || []).length;
}

/** A token is "gibberish" if it has no vowel at all, or is a keyboard-mash repeat run. */
function isGibberishToken(token) {
  if (!VOWEL_REGEX.test(token)) return true;
  if (REPEATED_RUN_REGEX.test(token)) return true;
  return false;
}

/**
 * Returns true if `rawName` contains at least one plausible person-name word:
 * >= 2 letters, has a vowel, isn't a repeated-character run. Digits/symbols
 * used as a "name" (e.g. a phone number, "@handle" junk, "...", ":Mmmnnn")
 * are stripped down to nothing or fail the vowel/repeat checks.
 */
function isIntelligibleName(rawName) {
  if (!rawName) return false;
  const cleaned = rawName.replace(STRIP_DECORATION_REGEX, "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2) return false;

  const tokens = cleaned.split(" ").filter(Boolean);
  return tokens.some((token) => countLetters(token) >= 2 && !isGibberishToken(token));
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "hotmail.es",
  "yahoo.com",
  "yahoo.es",
  "outlook.com",
  "outlook.es",
  "live.com",
  "live.com.mx",
  "icloud.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.net",
  "msn.com",
  "me.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
]);

function classifyDomain(email) {
  if (!email) return "sin correo";
  const at = email.lastIndexOf("@");
  if (at === -1) return "sin correo";
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return "sin correo";
  return FREE_EMAIL_DOMAINS.has(domain) ? "personal" : "corporativo";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const raw = await readFile(INPUT_PATH, "utf8");
  // Strip a possible UTF-8 BOM.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  const table = parseCSV(text).filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  const [header, ...dataRows] = table;

  const col = (name) => header.indexOf(name);
  const idx = {
    firstName: col("First Name"),
    middleName: col("Middle Name"),
    lastName: col("Last Name"),
    fileAs: col("File As"),
    orgName: col("Organization Name"),
    email1: col("E-mail 1 - Value"),
    phone1: col("Phone 1 - Value"),
  };

  for (const [key, i] of Object.entries(idx)) {
    if (i === -1) throw new Error(`Expected column not found in header: ${key}`);
  }

  const totalRead = dataRows.length;
  const kept = [];
  const droppedSamples = [];
  let droppedCount = 0;
  const seenKeys = new Set();

  for (const row of dataRows) {
    const isFullyEmpty = row.every((cell) => (cell ?? "").trim() === "");
    if (isFullyEmpty) {
      droppedCount++;
      continue;
    }

    const first = (row[idx.firstName] ?? "").trim();
    const middle = (row[idx.middleName] ?? "").trim();
    const last = (row[idx.lastName] ?? "").trim();
    const fileAs = (row[idx.fileAs] ?? "").trim();
    const empresa = (row[idx.orgName] ?? "").trim();
    const email = (row[idx.email1] ?? "").trim();
    const telefono = (row[idx.phone1] ?? "").trim();

    let nombre = [first, middle, last].filter(Boolean).join(" ").trim();
    if (!nombre) nombre = fileAs;

    const hasEmpresa = empresa.length > 0;
    const nameIsIntelligible = isIntelligibleName(nombre);

    if (!hasEmpresa && !nameIsIntelligible) {
      droppedCount++;
      if (droppedSamples.length < 5) droppedSamples.push(nombre || "(sin nombre)");
      continue;
    }

    // Dedup by lowercased email when present, else by lowercased nombre+empresa.
    const dedupKey = email
      ? `email:${email.toLowerCase()}`
      : `name:${nombre.toLowerCase()}|${empresa.toLowerCase()}`;
    if (seenKeys.has(dedupKey)) {
      droppedCount++;
      continue;
    }
    seenKeys.add(dedupKey);

    const tipo = hasEmpresa ? "empresa" : "persona";
    const dominio = classifyDomain(email);
    const motivo = hasEmpresa
      ? nameIsIntelligible
        ? "Tiene organización y nombre reconocible"
        : "Tiene organización"
      : "Nombre reconocible";

    kept.push({ nombre, empresa, email, telefono, tipo, dominio, motivo });
  }

  const dropped = droppedCount;
  const empresaCount = kept.filter((r) => r.tipo === "empresa").length;
  const personaCount = kept.filter((r) => r.tipo === "persona").length;
  const corporativoCount = kept.filter((r) => r.dominio === "corporativo").length;
  const personalCount = kept.filter((r) => r.dominio === "personal").length;
  const sinCorreoCount = kept.filter((r) => r.dominio === "sin correo").length;

  // ---- Write the workbook -------------------------------------------------
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Contactos");
  sheet.columns = [
    { header: "Incluir", key: "incluir", width: 10 },
    { header: "Nombre", key: "nombre", width: 30 },
    { header: "Empresa", key: "empresa", width: 30 },
    { header: "Email", key: "email", width: 30 },
    { header: "Teléfono", key: "telefono", width: 20 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Dominio", key: "dominio", width: 14 },
    { header: "Motivo", key: "motivo", width: 34 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of kept) {
    sheet.addRow({
      incluir: "Sí",
      nombre: r.nombre,
      empresa: r.empresa,
      email: r.email,
      telefono: r.telefono,
      tipo: r.tipo,
      dominio: r.dominio,
      motivo: r.motivo,
    });
  }

  await workbook.xlsx.writeFile(OUTPUT_PATH);

  // ---- Summary -------------------------------------------------------------
  console.log("=== Limpieza de contactos ===");
  console.log(`Filas leídas:   ${totalRead}`);
  console.log(`Conservadas:    ${kept.length}`);
  console.log(`Descartadas:    ${dropped}`);
  console.log();
  console.log("Desglose (conservadas):");
  console.log(`  Empresa:      ${empresaCount}`);
  console.log(`  Persona:      ${personaCount}`);
  console.log(`  Corporativo:  ${corporativoCount}`);
  console.log(`  Personal:     ${personalCount}`);
  console.log(`  Sin correo:   ${sinCorreoCount}`);
  console.log();
  console.log("Muestra de conservados (5):");
  for (const r of kept.slice(0, 5)) console.log(`  - ${r.nombre || "(sin nombre)"} ${r.empresa ? `[${r.empresa}]` : ""}`);
  console.log();
  console.log("Muestra de descartados (5):");
  for (const n of droppedSamples) console.log(`  - ${n}`);
  console.log();
  console.log(`Excel escrito en: ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
