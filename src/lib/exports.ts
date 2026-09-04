export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPDF(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename?: string,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map((v) => String(v ?? ""))),
    startY: 28,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 58, 95] },
  });
  doc.save((filename ?? title.toLowerCase().replace(/\s+/g, "-")) + ".pdf");
}
