"use client";

// Every write the owner's UI makes. Edits to existing records go in a batch
// with an auditLog entry per changed field, so history can't drift from data.
// Orders go through Cloud Functions, which do the same on the server.
import {
  addDoc, collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch, type WriteBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { methodLabel } from "@/lib/derive";
import { db, functions } from "@/lib/firebase";
import { money } from "@/lib/format";
import type { AuditEntry, Order, Payment, PaymentMethod, Vendor } from "@/lib/types";

const col = (businessId: string, name: string) => collection(db, "businesses", businessId, name);

function logEdits<T extends object>(
  batch: WriteBatch, businessId: string, uid: string,
  entity: AuditEntry["entity"], entityId: string, before: T, after: Partial<T>,
) {
  for (const [field, newValue] of Object.entries(after)) {
    const oldValue = (before as Record<string, unknown>)[field] ?? null;
    if (oldValue === newValue) continue;
    batch.set(doc(col(businessId, "auditLog")), {
      entity, entityId, field, oldValue, newValue: newValue ?? null,
      editedBy: uid, editedAt: serverTimestamp(),
    });
  }
}

/** Records a deletion; `summary` keeps the record readable in history after it's gone. */
function logDelete(
  batch: WriteBatch, businessId: string, uid: string,
  entity: AuditEntry["entity"], entityId: string, summary: string,
) {
  batch.set(doc(col(businessId, "auditLog")), {
    entity, entityId, field: "deleted", oldValue: summary, newValue: null,
    editedBy: uid, editedAt: serverTimestamp(),
  });
}

export function updateBusiness(businessId: string, changes: { name: string; phone: string }) {
  return updateDoc(doc(db, "businesses", businessId), changes);
}

/**
 * The new vendor's id is known right away, so the caller can use it without
 * waiting for the server (slow on a phone). `saved` settles once the server has it.
 */
export function addVendor(businessId: string, v: { name: string; phone: string }): { id: string; saved: Promise<void> } {
  const ref = doc(col(businessId, "vendors"));
  const saved = setDoc(ref, { name: v.name.trim(), phone: v.phone.trim(), notes: "", createdAt: serverTimestamp() });
  return { id: ref.id, saved };
}

export async function updateVendor(
  businessId: string, uid: string, vendor: Vendor, changes: Pick<Vendor, "phone" | "notes">,
) {
  const batch = writeBatch(db);
  batch.update(doc(col(businessId, "vendors"), vendor.id), changes);
  logEdits(batch, businessId, uid, "vendor", vendor.id, vendor, changes);
  await batch.commit();
}

export interface OrderDraft {
  orderId?: string;
  vendorId: string;
  items: { name: string; qty: number; rate: number }[];
  orderDate: string;
  expectedDate: string | null;
  status: Order["status"];
  invoiceAmount: number | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  note: string;
}

/** The editable fields of an existing order, ready to change and pass back to saveOrder. */
export function draftOf(o: Order): OrderDraft {
  return {
    orderId: o.id, vendorId: o.vendorId,
    items: o.items.map(({ name, qty, rate }) => ({ name, qty, rate })),
    orderDate: o.orderDate, expectedDate: o.expectedDate, status: o.status,
    invoiceAmount: o.invoiceAmount, invoiceNo: o.invoiceNo, invoiceDate: o.invoiceDate, note: o.note,
  };
}

export async function saveOrder(draft: OrderDraft): Promise<{ id: string; number: number }> {
  const res = await httpsCallable<OrderDraft, { id: string; number: number }>(functions, "saveOrder")(draft);
  return res.data;
}

export function updateOrder(order: Order, changes: Partial<OrderDraft>) {
  return saveOrder({ ...draftOf(order), ...changes });
}

export async function deleteOrder(orderId: string) {
  await httpsCallable(functions, "deleteOrder")({ orderId });
}

export interface NewPayment {
  amount: number;
  method: PaymentMethod;
  date: string;
  bankAccount?: string;
  bankRef?: string;
  chequeNo?: string;
  chequeBank?: string;
  chequeDate?: string;
  cashTo?: string;
}

/** `orderId` null means the payment counts against the vendor's account, oldest bills first. */
export function addPayment(businessId: string, vendor: Vendor, orderId: string | null, p: NewPayment) {
  const opt = (v: string | undefined, forMethod: PaymentMethod) =>
    p.method === forMethod && v?.trim() ? v.trim() : null;
  return addDoc(col(businessId, "payments"), {
    orderId,
    vendorId: vendor.id,
    vendorName: vendor.name,
    amount: p.amount,
    method: p.method,
    date: p.date,
    bankAccount: opt(p.bankAccount, "bank"),
    bankRef: opt(p.bankRef, "bank"),
    chequeNo: p.method === "cheque" ? (p.chequeNo ?? "").trim() : null,
    chequeBank: opt(p.chequeBank, "cheque"),
    chequeDate: opt(p.chequeDate, "cheque"),
    clearedStatus: p.method === "cheque" ? "issued" : null,
    clearedDate: null,
    cashTo: opt(p.cashTo, "cash"),
    createdAt: serverTimestamp(),
  });
}

export async function clearCheque(businessId: string, uid: string, payment: Payment, date: string) {
  const changes = { clearedStatus: "cleared" as const, clearedDate: date };
  const batch = writeBatch(db);
  batch.update(doc(col(businessId, "payments"), payment.id), changes);
  logEdits(batch, businessId, uid, "payment", payment.id, payment, changes);
  await batch.commit();
}

export async function deletePayment(businessId: string, uid: string, payment: Payment) {
  const batch = writeBatch(db);
  batch.delete(doc(col(businessId, "payments"), payment.id));
  logDelete(batch, businessId, uid, "payment", payment.id,
    `${payment.vendorName}: ${methodLabel(payment)}, ${money(payment.amount)} (${payment.date})`);
  await batch.commit();
}

export async function createVendorLink(vendorId: string): Promise<string> {
  const res = await httpsCallable<{ vendorId: string }, { token: string }>(functions, "createVendorLink")({ vendorId });
  return res.data.token;
}

export async function revokeVendorLink(vendorId: string) {
  await httpsCallable(functions, "revokeVendorLink")({ vendorId });
}

export const vendorLinkUrl = (token: string) => `${window.location.origin}/v/${token}`;
