import { strFromU8, unzipSync } from "fflate";

const mainNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export type XlsxRow = { rowNumber: number; cells: string[] };

function parseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new Error("The selected Excel file contains invalid workbook data.");
  }
  return document;
}

function textContent(element: Element): string {
  return Array.from(element.getElementsByTagNameNS(mainNamespace, "t"))
    .map((text) => text.textContent ?? "")
    .join("");
}

function columnIndex(reference: string | null, fallback: number): number {
  const letters = reference?.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) return fallback;
  return Array.from(letters).reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export function readXlsxRows(bytes: Uint8Array): XlsxRow[] {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
    throw new Error("Choose an Excel file no larger than 5 MB.");
  }

  const files = unzipSync(bytes);
  const workbookXml = files["xl/workbook.xml"];
  const relationshipsXml = files["xl/_rels/workbook.xml.rels"];
  if (!workbookXml || !relationshipsXml) {
    throw new Error("The selected file is not a valid .xlsx workbook.");
  }

  const workbook = parseXml(strFromU8(workbookXml));
  const firstSheet = workbook.getElementsByTagNameNS(mainNamespace, "sheet")[0];
  const relationshipId = firstSheet?.getAttributeNS(relationshipNamespace, "id");
  if (!relationshipId) throw new Error("The Excel workbook does not contain a worksheet.");

  const relationships = parseXml(strFromU8(relationshipsXml));
  const relationship = Array.from(relationships.getElementsByTagName("*"))
    .find((element) => element.getAttribute("Id") === relationshipId);
  const target = relationship?.getAttribute("Target");
  if (!target) throw new Error("The first Excel worksheet could not be found.");

  const worksheetPath = target.startsWith("/")
    ? target.slice(1)
    : `xl/${target}`;
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(worksheetPath)) {
    throw new Error("The first Excel worksheet has an unsupported location.");
  }
  const worksheetXml = files[worksheetPath];
  if (!worksheetXml) throw new Error("The first Excel worksheet could not be read.");

  const sharedStringsXml = files["xl/sharedStrings.xml"];
  const sharedStrings = sharedStringsXml
    ? Array.from(parseXml(strFromU8(sharedStringsXml)).getElementsByTagNameNS(mainNamespace, "si"), textContent)
    : [];
  const worksheet = parseXml(strFromU8(worksheetXml));
  const rows = Array.from(worksheet.getElementsByTagNameNS(mainNamespace, "row"));
  if (rows.length > 501) throw new Error("Import a maximum of 500 item rows at a time.");

  return rows.map((row, rowIndex) => {
    const cells: string[] = [];
    Array.from(row.getElementsByTagNameNS(mainNamespace, "c")).forEach((cell, cellIndex) => {
      const index = columnIndex(cell.getAttribute("r"), cellIndex);
      const value = cell.getElementsByTagNameNS(mainNamespace, "v")[0]?.textContent ?? "";
      const type = cell.getAttribute("t");
      cells[index] = type === "s"
        ? sharedStrings[Number(value)] ?? ""
        : type === "inlineStr"
          ? textContent(cell)
          : type === "b"
            ? value === "1" ? "TRUE" : "FALSE"
            : value;
    });
    return { rowNumber: Number(row.getAttribute("r")) || rowIndex + 1, cells };
  });
}
