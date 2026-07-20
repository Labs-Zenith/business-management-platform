#!/usr/bin/env node
/**
 * Merges two Google Contacts CSV exports, cleans decorated/junk names, and
 * produces a single Excel workbook for human review. Pure file I/O — no
 * database, no network.
 *
 * Usage: node scripts/clean-contacts.mjs
 *        node scripts/clean-contacts.mjs --inputs="path/a.csv,path/b.csv"
 *
 * Default input:  docs/contactos-printing/contacts (2).csv  (phone-book export)
 *                 docs/contactos-printing/contacts (3).csv  (email-rich "Other Contacts")
 * Output:         docs/contactos-printing/contactos-limpios.xlsx
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT_PATHS = [
  path.join(ROOT, "docs/contactos-printing/contacts (2).csv"),
  path.join(ROOT, "docs/contactos-printing/contacts (3).csv"),
];
const OUTPUT_PATH = path.join(ROOT, "docs/contactos-printing/contactos-limpios.xlsx");

function parseInputPathsFromArgv(argv) {
  const flag = argv.find((a) => a.startsWith("--inputs="));
  if (!flag) return DEFAULT_INPUT_PATHS;
  const raw = flag.slice("--inputs=".length);
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (path.isAbsolute(p) ? p : path.join(ROOT, p)));
}

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
// Name cleaning: strip emoji/decoration/control chars, then trim any
// leading/trailing non-letter characters so the name starts and ends with a
// real letter. Internal hyphens, apostrophes, periods and accents/ñ survive.
// ---------------------------------------------------------------------------

// Emoji/pictographs. Deliberately NOT \p{Emoji}, which also matches plain
// digits 0-9 (they carry the Emoji property for keycap sequences like 1️⃣)
// and would corrupt names containing numbers.
const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const EMOJI_REGEX_TEST = /\p{Extended_Pictographic}/u;
// Leftover emoji plumbing that isn't itself "pictographic": skin-tone
// modifiers, zero-width joiners, variation selectors. These trail an emoji
// base character that Extended_Pictographic already removed.
const EMOJI_RESIDUE_REGEX = /[\u200D\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}]/gu;
const DECORATION_REGEX = /[@*~•·…►★✦»«]/gu;
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F-\u009F]/g;
const NON_LETTER_START_REGEX = /^[^\p{L}]+/u;
const NON_LETTER_END_REGEX = /[^\p{L}]+$/u;

function cleanName(raw) {
  if (!raw) return "";
  // NFKC first: folds Unicode "compatibility" variants (e.g. Mathematical
  // Alphanumeric Symbols like 𝓒𝓪𝓶𝓲𝓵𝓪) down to plain ASCII letters, so
  // stylized-font names become normal text. NFKC (not NFKD) keeps combining
  // marks composed with their base letter, so accented Spanish letters like
  // "é" and "ñ" are preserved as single precomposed characters rather than
  // being decomposed into base+diacritic (which downstream steps could then
  // strip as "decoration").
  let s = raw
    .normalize("NFKC")
    .replace(EMOJI_REGEX, "")
    .replace(EMOJI_RESIDUE_REGEX, "")
    .replace(DECORATION_REGEX, "")
    .replace(CONTROL_CHARS_REGEX, "");
  s = s.replace(NON_LETTER_START_REGEX, "").replace(NON_LETTER_END_REGEX, "");
  return s.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Name intelligibility heuristic (applied to the already-CLEANED name)
// ---------------------------------------------------------------------------

// Characters allowed to survive as "signal" for this check: letters (any
// script), combining marks (diacritics), spaces, periods, hyphens,
// apostrophes. Everything else is stripped before the vowel/repeat test.
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
 * Returns true if `cleanedName` contains at least one plausible person-name
 * word: >= 2 letters, has a vowel, isn't a repeated-character run.
 */
function isIntelligibleName(cleanedName) {
  if (!cleanedName) return false;
  const stripped = cleanedName.replace(STRIP_DECORATION_REGEX, "").replace(/\s+/g, " ").trim();
  if (stripped.length < 2) return false;

  const tokens = stripped.split(" ").filter(Boolean);
  return tokens.some((token) => countLetters(token) >= 2 && !isGibberishToken(token));
}

/** Derives a readable display name from an email local-part, e.g. "j.perez_ventas" -> "J Perez Ventas". */
function labelFromEmail(email) {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
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
// Per-file loading: map columns BY NAME (the two exports have different
// column counts/order), never by fixed numeric index.
// ---------------------------------------------------------------------------

// Columns every export is expected to have. "Phone 1 - Value" is optional
// (absent in the "Other Contacts" export) and defaults to an empty phone.
const REQUIRED_COLUMNS = {
  firstName: "First Name",
  middleName: "Middle Name",
  lastName: "Last Name",
  fileAs: "File As",
  orgName: "Organization Name",
  email1: "E-mail 1 - Value",
};
const OPTIONAL_COLUMNS = {
  phone1: "Phone 1 - Value",
};

async function loadFile(inputPath, emojiSamples) {
  const raw = await readFile(inputPath, "utf8");
  // Strip a possible UTF-8 BOM.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  const table = parseCSV(text).filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  const [header, ...dataRows] = table;

  const col = (name) => header.indexOf(name);
  const idx = {};
  for (const [key, name] of Object.entries(REQUIRED_COLUMNS)) {
    const i = col(name);
    if (i === -1) throw new Error(`Expected column not found in ${path.basename(inputPath)}: ${name}`);
    idx[key] = i;
  }
  for (const [key, name] of Object.entries(OPTIONAL_COLUMNS)) {
    idx[key] = col(name); // -1 is fine: that field is simply absent from this export.
  }

  const candidates = [];
  let droppedCount = 0;

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
    const telefono = idx.phone1 === -1 ? "" : (row[idx.phone1] ?? "").trim();

    let rawName = [first, middle, last].filter(Boolean).join(" ").trim();
    if (!rawName) rawName = fileAs;

    if (emojiSamples.length < 8 && EMOJI_REGEX_TEST.test(rawName)) {
      emojiSamples.push({ raw: rawName, cleaned: cleanName(rawName) });
    }

    let nombre = cleanName(rawName);

    const hasEmpresa = empresa.length > 0;
    const hasEmail = email.length > 0;
    const nameIntelligible = isIntelligibleName(nombre);

    if (!hasEmpresa && !nameIntelligible && !hasEmail) {
      droppedCount++;
      continue;
    }

    let nameDerivedFromEmail = false;
    if (!nombre && hasEmail) {
      nombre = labelFromEmail(email);
      nameDerivedFromEmail = true;
    } else if (!nombre && hasEmpresa) {
      // No email to derive a label from, but there's an organization name —
      // use it so the row still has a usable, non-blank Nombre.
      nombre = empresa;
    }

    const dominio = classifyDomain(email);
    const reasons = [];
    if (hasEmpresa) reasons.push("empresa");
    if (nameIntelligible) reasons.push("nombre entendible");
    if (hasEmail && !hasEmpresa && !nameIntelligible) {
      reasons.push(dominio === "corporativo" ? "correo corporativo" : "correo personal");
    } else if (hasEmail) {
      reasons.push("correo");
    }

    candidates.push({
      nombre,
      empresa,
      email,
      telefono,
      tipo: hasEmpresa ? "empresa" : "persona",
      dominio,
      motivo: reasons.join(", "),
      nameDerivedFromEmail,
    });
  }

  return { totalRead: dataRows.length, droppedCount, candidates };
}

// ---------------------------------------------------------------------------
// Cross-file dedup: by lowercased email when present, else by lowercased
// "nombre|empresa". On collision, keep whichever row has more data (counting
// presence of email, telefono, empresa).
// ---------------------------------------------------------------------------
function completenessScore(r) {
  return (r.email ? 1 : 0) + (r.telefono ? 1 : 0) + (r.empresa ? 1 : 0);
}

function dedupMerge(candidates) {
  const byKey = new Map();
  let dedupMergedCount = 0;

  for (const r of candidates) {
    const key = r.email ? `email:${r.email.toLowerCase()}` : `name:${r.nombre.toLowerCase()}|${r.empresa.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, r);
      continue;
    }
    dedupMergedCount++;
    if (completenessScore(r) > completenessScore(existing)) {
      byKey.set(key, r);
    }
  }

  return { kept: [...byKey.values()], dedupMergedCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const inputPaths = parseInputPathsFromArgv(process.argv.slice(2));
  const emojiSamples = [];

  const loaded = [];
  for (const inputPath of inputPaths) {
    loaded.push({ inputPath, ...(await loadFile(inputPath, emojiSamples)) });
  }

  const allCandidates = loaded.flatMap((f) => f.candidates);
  const totalDroppedByRule = loaded.reduce((sum, f) => sum + f.droppedCount, 0);

  const { kept, dedupMergedCount } = dedupMerge(allCandidates);

  const emailDerivedCount = kept.filter((r) => r.nameDerivedFromEmail).length;
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
  console.log("=== Limpieza y fusión de contactos ===");
  for (const f of loaded) {
    console.log(`Filas leídas (${path.basename(f.inputPath)}): ${f.totalRead}`);
  }
  console.log(`Conservadas (total):        ${kept.length}`);
  console.log(`Descartadas (regla KEEP):   ${totalDroppedByRule}`);
  console.log(`Fusionadas por duplicado:   ${dedupMergedCount}`);
  console.log(`Nombre derivado del email:  ${emailDerivedCount}`);
  console.log();
  console.log("Desglose (conservadas):");
  console.log(`  Empresa:      ${empresaCount}`);
  console.log(`  Persona:      ${personaCount}`);
  console.log(`  Corporativo:  ${corporativoCount}`);
  console.log(`  Personal:     ${personalCount}`);
  console.log(`  Sin correo:   ${sinCorreoCount}`);
  console.log();
  console.log(`Muestra de nombres con emoji/símbolos limpiados (${emojiSamples.length}):`);
  for (const s of emojiSamples) console.log(`  - ${JSON.stringify(s.raw)} -> ${JSON.stringify(s.cleaned)}`);
  console.log();
  console.log("Muestra de conservados (5):");
  for (const r of kept.slice(0, 5)) console.log(`  - ${r.nombre || "(sin nombre)"} ${r.empresa ? `[${r.empresa}]` : ""}`);
  console.log();
  console.log(`Excel escrito en: ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
