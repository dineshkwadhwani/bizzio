type InvoicePdfLine = {
  description: string;
  qty: number;
  rate: number;
  gstPercent: number;
  total: number;
};

type InvoicePdfInput = {
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  title: string;
  invoiceDate: string;
  lines: InvoicePdfLine[];
  baseTotal: number;
  gstTotal: number;
  grandTotal: number;
};

type CommercialDocumentPdfInput = {
  documentLabel: "QUOTATION" | "PURCHASE ORDER";
  companyName: string;
  recipientLabel: "Customer" | "Vendor";
  recipientName: string;
  documentNumber: string;
  title: string;
  documentDate: string;
  lines: InvoicePdfLine[];
  baseTotal: number;
  gstTotal: number;
  grandTotal: number;
};

function pdfText(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
}

function money(value: number) {
  return `INR ${value.toFixed(2)}`;
}

/** Creates a compact, dependency-free PDF suitable for email attachments. */
export function buildInvoicePdf(input: InvoicePdfInput) {
  const lines: string[] = [
    "BT",
    "/F1 18 Tf",
    "50 790 Td",
    `(${pdfText(input.companyName)}) Tj`,
    "/F1 14 Tf",
    "0 -28 Td",
    "(SALES INVOICE) Tj",
    "/F1 10 Tf",
    "0 -24 Td",
    `(${pdfText(input.invoiceNumber)}    Date: ${pdfText(input.invoiceDate)}) Tj`,
    "0 -16 Td",
    `(${pdfText(input.title)}) Tj`,
    "0 -28 Td",
    `Bill To: ${pdfText(input.customerName)}) Tj`.replace("Bill To: ", "(Bill To: "),
    "0 -30 Td",
    "(Description                         Qty       Rate          GST       Total) Tj",
    "0 -14 Td",
    "(----------------------------------------------------------------------------) Tj"
  ];

  for (const line of input.lines.slice(0, 28)) {
    const description = pdfText(line.description).slice(0, 34).padEnd(34, " ");
    const row = `${description} ${String(line.qty).padStart(5, " ")} ${money(line.rate).padStart(14, " ")} ${`${line.gstPercent.toFixed(2)}%`.padStart(7, " ")} ${money(line.total).padStart(14, " ")}`;
    lines.push("0 -14 Td", `(${pdfText(row)}) Tj`);
  }

  lines.push(
    "0 -28 Td",
    `(${pdfText(`Base amount: ${money(input.baseTotal)}`)}) Tj`,
    "0 -14 Td",
    `(${pdfText(`GST amount: ${money(input.gstTotal)}`)}) Tj`,
    "0 -18 Td",
    `/F1 12 Tf`,
    `(${pdfText(`Grand total: ${money(input.grandTotal)}`)}) Tj`,
    "ET"
  );

  const content = lines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  const header = "%PDF-1.4\n%\xff\xff\xff\xff\n";
  let pdf = header;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

/** Creates a compact PDF for customer quotations and vendor purchase orders. */
export function buildCommercialDocumentPdf(input: CommercialDocumentPdfInput) {
  const lines: string[] = [
    "BT",
    "/F1 18 Tf",
    "50 790 Td",
    `(${pdfText(input.companyName)}) Tj`,
    "/F1 14 Tf",
    "0 -28 Td",
    `(${input.documentLabel}) Tj`,
    "/F1 10 Tf",
    "0 -24 Td",
    `(${pdfText(input.documentNumber)}    Date: ${pdfText(input.documentDate)}) Tj`,
    "0 -16 Td",
    `(${pdfText(input.title)}) Tj`,
    "0 -28 Td",
    `(${pdfText(`${input.recipientLabel}: ${input.recipientName}`)}) Tj`,
    "0 -30 Td",
    "(Description                         Qty       Rate          GST       Total) Tj",
    "0 -14 Td",
    "(----------------------------------------------------------------------------) Tj"
  ];

  for (const line of input.lines.slice(0, 28)) {
    const description = pdfText(line.description).slice(0, 34).padEnd(34, " ");
    const row = `${description} ${String(line.qty).padStart(5, " ")} ${money(line.rate).padStart(14, " ")} ${`${line.gstPercent.toFixed(2)}%`.padStart(7, " ")} ${money(line.total).padStart(14, " ")}`;
    lines.push("0 -14 Td", `(${pdfText(row)}) Tj`);
  }

  lines.push(
    "0 -28 Td",
    `(${pdfText(`Base amount: ${money(input.baseTotal)}`)}) Tj`,
    "0 -14 Td",
    `(${pdfText(`GST amount: ${money(input.gstTotal)}`)}) Tj`,
    "0 -18 Td",
    "/F1 12 Tf",
    `(${pdfText(`Grand total: ${money(input.grandTotal)}`)}) Tj`,
    "ET"
  );

  const content = lines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  const header = "%PDF-1.4\n%\xff\xff\xff\xff\n";
  let pdf = header;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

export function buildQuotationPdf(input: Omit<CommercialDocumentPdfInput, "documentLabel" | "recipientLabel">) {
  return buildCommercialDocumentPdf({ ...input, documentLabel: "QUOTATION", recipientLabel: "Customer" });
}

export function buildPurchaseOrderPdf(input: Omit<CommercialDocumentPdfInput, "documentLabel" | "recipientLabel">) {
  return buildCommercialDocumentPdf({ ...input, documentLabel: "PURCHASE ORDER", recipientLabel: "Vendor" });
}
