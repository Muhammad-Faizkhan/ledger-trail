"use client";

// Every write the owner's UI makes. Edits to existing records go in a batch
// with an auditLog entry per changed field, so history can't drift from data.
import {
  addDoc, collection, doc, serverTimestamp, writeBatch, type WriteBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import type { AuditEntry, Order, OrderStatus, Payment, PaymentMethod, Vendor } from "@/lib/types";

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

export async function updateVendor(
  businessId: string, uid: string, vendor: Vendor, changes: Pick<Vendor, "phone" | "notes">,
) {
  const batch = writeBatch(db);
  batch.update(doc(col(businessId, "vendors"), vendor.id), changes);
  logEdits(batch, businessId, uid, "vendor", vendor.id, vendor, changes);
  await batch.commit();
}

export interface NewOrder {
  description: string;
  qty: number;
  rate: number;
  orderDate: string;
  status: OrderStatus;
}

export function addOrder(businessId: string, vendor: Vendor, o: NewOrder) {
  return addDoc(col(businessId, "orders"), {
    vendorId: vendor.id,
    vendorName: vendor.name,
    description: o.description,
    qty: o.qty,
    rate: o.rate,
    // Must equal qty * rate exactly; the security rules check it.
    amount: o.qty * o.rate,
    orderDate: o.orderDate,
    status: o.status,
    invoiceAmount: null,
    invoiceDate: null,
    createdAt: serverTimestamp(),
  });
}

export async function updateOrder(
  businessId: string, uid: string, order: Order,
  changes: Partial<Pick<Order, "status" | "invoiceAmount" | "invoiceDate">>,
) {
  const batch = writeBatch(db);
  batch.update(doc(col(businessId, "orders"), order.id), changes);
  logEdits(batch, businessId, uid, "order", order.id, order, changes);
  await batch.commit();
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

export function addPayment(businessId: string, order: Order, p: NewPayment) {
  const opt = (v: string | undefined, forMethod: PaymentMethod) =>
    p.method === forMethod && v?.trim() ? v.trim() : null;
  return addDoc(col(businessId, "payments"), {
    orderId: order.id,
    vendorId: order.vendorId,
    vendorName: order.vendorName,
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

export async function createVendorLink(vendorId: string): Promise<string> {
  const res = await httpsCallable<{ vendorId: string }, { token: string }>(functions, "createVendorLink")({ vendorId });
  return res.data.token;
}

export async function revokeVendorLink(vendorId: string) {
  await httpsCallable(functions, "revokeVendorLink")({ vendorId });
}

export const vendorLinkUrl = (token: string) => `${window.location.origin}/v/${token}`;

