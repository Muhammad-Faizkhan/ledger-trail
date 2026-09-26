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

export interface Order {
  id: string;
  vendorId: string;
  vendorName: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  orderDate: string;
  status: OrderStatus;
  invoiceAmount: number | null;
  invoiceDate: string | null;
  createdAt: Timestamp | null;
}

export interface Payment {
  id: string;
  orderId: string;
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
