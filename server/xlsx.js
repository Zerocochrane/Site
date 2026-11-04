// Gerador mínimo de .xlsx (Office Open XML) usando o archiver que já está instalado.
// Suporta várias abas, textos, números, datas, fórmulas, larguras de coluna e alguns estilos.
import archiver from 'archiver';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

// Estilos (índices usados em cell.style)
export const S = { text: 0, header: 1, money: 2, date: 3, totalMoney: 4, hours: 5, title: 6, totalLabel: 7, int: 8 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="0.0"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8E9F1"/></patternFill></fill></fills>
<borders count="2"><border/><border><top style="thin"/></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Data ISO (AAAA-MM-DD) → número de série do Excel. */
export const excelDate = (iso) => (Date.UTC(...iso.split('-').map((v, i) => (i === 1 ? v - 1 : +v))) - Date.UTC(1899, 11, 30)) / 86400000;

function sheetXml({ rows, widths = [] }) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const body = rows.map((row, r) => `<row r="${r + 1}">${(row || []).map((cell, c) => {
    if (cell === null || cell === undefined || cell === '') return '';
    const cl = typeof cell === 'object' ? cell : { v: cell };
    const ref = `${colName(c)}${r + 1}`;
    const s = cl.style ? ` s="${cl.style}"` : '';
    if (cl.f) return `<c r="${ref}"${s}><f>${esc(cl.f)}</f>${cl.v !== undefined ? `<v>${cl.v}</v>` : ''}</c>`;
    if (typeof cl.v === 'number' && Number.isFinite(cl.v)) return `<c r="${ref}"${s}><v>${cl.v}</v></c>`;
    if (cl.v === null || cl.v === undefined || cl.v === '') return cl.style ? `<c r="${ref}"${s}/>` : '';
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(cl.v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

/** Escreve a planilha no stream (ex.: res). sheets = [{ name, rows: [[cell]], widths }] */
export function writeXlsx(stream, sheets) {
  const zip = archiver('zip', { zlib: { level: 6 } });
  zip.pipe(stream);
  const n = sheets.length;
  zip.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`, { name: '[Content_Types].xml' });
  zip.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>', { name: '_rels/.rels' });
  zip.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`, { name: 'xl/workbook.xml' });
  zip.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`, { name: 'xl/_rels/workbook.xml.rels' });
  zip.append(STYLES, { name: 'xl/styles.xml' });
  sheets.forEach((s, i) => zip.append(sheetXml(s), { name: `xl/worksheets/sheet${i + 1}.xml` }));
  return zip.finalize();
}
