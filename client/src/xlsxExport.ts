import { strToU8, zipSync } from "fflate";

export type XlsxCell = string | number | boolean | null | undefined;
export type XlsxSheet = { name: string; rows: XlsxCell[][] };

function escapeXml(value: string): string {
  let safeValue = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const validControl = codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;
    if (
      (codePoint >= 0x20 || validControl) &&
      !(codePoint >= 0xd800 && codePoint <= 0xdfff) &&
      codePoint % 0x10000 !== 0xfffe &&
      codePoint % 0x10000 !== 0xffff
    ) safeValue += character;
  }
  return safeValue
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number): string {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function cellXml(value: XlsxCell, reference: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}" t="n"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  const text = value === null || value === undefined ? "" : String(value);
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function worksheetXml(sheet: XlsxSheet): string {
  const columnCount = Math.max(1, ...sheet.rows.map((row) => row.length));
  const rowXml = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => cellXml(value, `${columnName(columnIndex)}${rowIndex + 1}`)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const filter = sheet.rows.length > 0
    ? `<autoFilter ref="A1:${columnName(columnCount - 1)}${sheet.rows.length}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rowXml}</sheetData>${filter}</worksheet>`;
}

export function createXlsxWorkbook(sheets: XlsxSheet[]): Uint8Array {
  const usedNames = new Set<string>();
  const safeSheets = sheets.map((sheet, index) => {
    const requestedName = sheet.name.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || `Sheet${index + 1}`;
    let name = requestedName;
    let suffix = 2;
    while (usedNames.has(name.toLocaleLowerCase())) {
      const ending = ` ${suffix}`;
      name = `${requestedName.slice(0, 31 - ending.length)}${ending}`;
      suffix += 1;
    }
    usedNames.add(name.toLocaleLowerCase());
    return { ...sheet, name };
  });
  if (safeSheets.length === 0) throw new Error("An Excel workbook must contain at least one sheet");

  const contentTypes = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    ...safeSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    `</Types>`,
  ].join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safeSheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
  };
  safeSheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}
