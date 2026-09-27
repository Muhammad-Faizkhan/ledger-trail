// Builds the purchase order and vendor statement as PDF files, straight from
// the data (not a screenshot), so they're sharp and small enough for WhatsApp.
// Loaded on demand; see SharePdfButton.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { byOrderAge, byPaymentAge, methodLabel } from "./derive";
import { itemsSummary, money, num, poNumber } from "./format";
import type { Business, Order, Payment, Vendor } from "./types";

const MARGIN = 40;
const GREY = 110;

function newDoc() {
  return new jsPDF({ unit: "pt", format: "a4" });
}

const tableEnd = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/** Business name and phone across the top, then a title on the left and details on the right. */
function header(doc: jsPDF, business: Pick<Business, "name" | "phone">, title: string, right: [string, string][]): number {
  const width = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(0);
  doc.text(business.name || "—", MARGIN, 56);
  let y = 72;
  if (business.phone) {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(GREY);
    doc.text(business.phone, MARGIN, y);
    y += 10;
  }
  doc.setDrawColor(0).setLineWidth(1.5).line(MARGIN, y, width - MARGIN, y);

  y += 30;
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(0);
  doc.text(title, MARGIN, y);
  doc.setFontSize(10);
  let ry = y - 12;
  for (const [label, value] of right) {
    doc.setFont("helvetica", "normal").setTextColor(GREY);
    doc.text(label, width - MARGIN - 150, ry);
    doc.setFont("helvetica", "bold").setTextColor(0);
    doc.text(value, width - MARGIN, ry, { align: "right" });
    ry += 14;
  }
  return Math.max(y, ry) + 16;
}

function party(doc: jsPDF, y: number, label: string, name: string, phone: string): number {
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(GREY);
  doc.text(label, MARGIN, y);
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(0);
  doc.text(name, MARGIN, y + 16);
  if (phone) {
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text(phone, MARGIN, y + 30);
    return y + 48;
  }
  return y + 34;
}

// Wide enough for "Rs 99,999,999" on one line.
const moneyCol = { halign: "right" as const, cellWidth: 88 };

const tableStyle = {
  theme: "plain" as const,
  margin: { left: MARGIN, right: MARGIN },
  styles: { font: "helvetica", fontSize: 10, cellPadding: 6, textColor: 0 },
  headStyles: { fontStyle: "bold" as const, lineWidth: { bottom: 1.2 }, lineColor: 0 },
  bodyStyles: { lineWidth: { bottom: 0.4 }, lineColor: 200 },
  footStyles: { fontStyle: "bold" as const, fontSize: 11 },
};

export function orderPdf(order: Order, vendor: Vendor | undefined, business: Business): Blob {
  const doc = newDoc();
  const right: [string, string][] = [["Order no.", poNumber(order.number)], ["Date", order.orderDate]];
  if (order.expectedDate) right.push(["Deliver by", order.expectedDate]);
  let y = header(doc, business, "Purchase order", right);
  y = party(doc, y, "To", order.vendorName, vendor?.phone ?? "");

  autoTable(doc, {
    ...tableStyle,
    startY: y,
    head: [["#", "Item", "Qty", "Rate", "Amount"]],
    body: order.items.map((it, i) => [String(i + 1), it.name, num(it.qty), money(it.rate), money(it.amount)]),
    foot: [["", "", "", "Total", money(order.amount)]],
    columnStyles: { 0: { cellWidth: 26 }, 2: { halign: "right", cellWidth: 60 }, 3: moneyCol, 4: moneyCol },
    didParseCell: (d) => {
      if (d.section !== "body" && d.column.index >= 2) d.cell.styles.halign = "right";
    },
  });

  if (order.note) {
    const noteY = tableEnd(doc) + 24;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(GREY).text("Note", MARGIN, noteY);
    doc.setTextColor(0).text(doc.splitTextToSize(order.note, doc.internal.pageSize.getWidth() - MARGIN * 2), MARGIN, noteY + 14);
  }
  return doc.output("blob");
}

export function statementPdf(vendor: Vendor, orders: Order[], payments: Payment[], business: Business, asOf: string): Blob {
  const doc = newDoc();
  let y = header(doc, business, "Statement", [["As of", asOf]]);
  y = party(doc, y, "Vendor", vendor.name, vendor.phone);

  // Orders before payments on the same day, each already oldest first.
  const lines = [
    ...orders.filter((o) => o.vendorId === vendor.id).sort(byOrderAge).map((o) => ({
      date: o.orderDate, text: `${poNumber(o.number)} · ${itemsSummary(o.items)}`, ordered: o.amount, paid: 0,
    })),
    ...payments.filter((p) => p.vendorId === vendor.id).sort(byPaymentAge).map((p) => ({
      date: p.date,
      text: `${methodLabel(p)}${p.method === "cheque" && p.clearedStatus !== "cleared" ? " (not cleared)" : ""}`,
      ordered: 0, paid: p.amount,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || b.ordered - a.ordered);

  let balance = 0;
  const body = lines.map((l) => {
    balance = Math.round((balance + l.ordered - l.paid) * 100) / 100;
    return [l.date, l.text, l.ordered ? money(l.ordered) : "", l.paid ? money(l.paid) : "", money(balance)];
  });
  const ordered = lines.reduce((s, l) => s + l.ordered, 0);
  const paid = lines.reduce((s, l) => s + l.paid, 0);

  autoTable(doc, {
    ...tableStyle,
    startY: y,
    head: [["Date", "Details", "Ordered", "Paid", "Balance"]],
    body: body.length ? body : [["", "No orders or payments yet.", "", "", ""]],
    foot: [["", "Total", money(ordered), money(paid), money(balance)]],
    columnStyles: { 0: { cellWidth: 70 }, 2: moneyCol, 3: moneyCol, 4: moneyCol },
    didParseCell: (d) => {
      if (d.section !== "body" && d.column.index >= 2) d.cell.styles.halign = "right";
    },
  });

  const endY = tableEnd(doc) + 28;
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0);
  doc.text(balance < 0 ? `Paid in advance: ${money(-balance)}` : `Balance due: ${money(balance)}`, MARGIN, endY);
  return doc.output("blob");
}
