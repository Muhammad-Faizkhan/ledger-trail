import type { Timestamp } from "firebase/firestore";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled";
export type OrderStatus = "ordered" | "confirmed" | "received";
export type PaymentMethod = "bank" | "cheque" | "cash";

export interface Business {
  ownerUid: string;
  name: string;
  phone: string;
  createdAt: Timestamp | null;
  subscriptionStatus: SubscriptionStatus;
}

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  notes: string;
  linkToken?: string | null;
  createdAt: Timestamp | null;
}

export interface OrderItem {
  name: string;
  qty: number;
  rate: number;
  /** round2(qty * rate), computed by the saveOrder function. */
  amount: number;
}

/** Orders are written only by the saveOrder / deleteOrder Cloud Functions. */
export interface Order {
  id: string;
  /** 1, 2, 3… per business; shown as PO-0001. Never reused. */
  number: number;
  vendorId: string;
  vendorName: string;
  items: OrderItem[];
  /** Sum of item amounts. */
  amount: number;
  orderDate: string;
  expectedDate: string | null;
  status: OrderStatus;
  invoiceAmount: number | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  note: string;
  createdAt: Timestamp | null;
}

export interface Payment {
  id: string;
  /** Pinned to one order, or null to count against the vendor's account (oldest bills first). */
  orderId: string | null;
  vendorId: string;
  vendorName: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  bankAccount: string | null;
  bankRef: string | null;
  chequeNo: string | null;
  chequeBank: string | null;
  chequeDate: string | null;
  clearedStatus: "issued" | "cleared" | null;
  clearedDate: string | null;
  cashTo: string | null;
  createdAt: Timestamp | null;
}

/** Saved item list, kept up to date by saveOrder. */
export interface CatalogItem {
  id: string;
  name: string;
  lastRate: number;
  updatedAt: Timestamp | null;
}

export interface AuditEntry {
  id: string;
  entity: "vendor" | "order" | "payment";
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  editedBy: string;
  editedAt: Timestamp | null;
}

export const ORDER_STATUSES: OrderStatus[] = ["ordered", "confirmed", "received"];
