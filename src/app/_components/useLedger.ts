"use client";

import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import type { Business, Order, Payment, Vendor } from "@/lib/types";

export interface Ledger {
  business: Business | null;
  vendors: Vendor[];
  orders: Order[];
  payments: Payment[];
  loaded: boolean;
  error: string;
}

/** Live view of one business: its profile plus every vendor, order and payment. */
export function useLedger(businessId: string): Ledger {
  const [business, setBusiness] = useState<Business | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ready, setReady] = useState({ business: false, vendors: false, orders: false, payments: false });
  const [error, setError] = useState("");

  useEffect(() => {
    const base = `businesses/${businessId}`;
    const fail = (e: Error) => setError(e.message);
    const done = (k: keyof typeof ready) => setReady((r) => (r[k] ? r : { ...r, [k]: true }));
    const list = <T,>(name: string, sortField: string, set: (v: T[]) => void, k: keyof typeof ready) =>
      onSnapshot(
        query(collection(db, base, name), orderBy(sortField)),
        (snap) => {
          set(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }) as T));
          done(k);
        },
        fail,
      );
    const unsubs = [
      onSnapshot(doc(db, base), (snap) => {
        setBusiness((snap.data() as Business | undefined) ?? null);
        done("business");
      }, fail),
      list<Vendor>("vendors", "name", setVendors, "vendors"),
      list<Order>("orders", "orderDate", setOrders, "orders"),
      list<Payment>("payments", "date", setPayments, "payments"),
    ];
    return () => unsubs.forEach((u) => u());
  }, [businessId]);

  return {
    business, vendors, orders, payments, error,
    loaded: ready.business && ready.vendors && ready.orders && ready.payments,
  };
}
