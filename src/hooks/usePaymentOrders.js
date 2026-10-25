import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase.js';

const EXPIRY_MS = 24 * 60 * 60 * 1000;

function normalizeOrder(order) {
  if (!order) return order;
  let status = order.status;
  if (status === 'pending' && order.created_at) {
    const created = new Date(order.created_at).getTime();
    if (Date.now() - created > EXPIRY_MS) status = 'expired';
  }
  return { ...order, status };
}

export function usePaymentOrders() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted && data?.session?.user) setUser(data.session.user);
      } catch {}
      if (!user) {
        try {
          const { data } = await supabase.auth.getUser();
          if (mounted && data?.user) setUser(data.user);
        } catch {}
      }
    };
    loadUser();
    let sub;
    try {
      const res = supabase.auth.onAuthStateChange((_e, session) => {
        if (mounted) setUser(session?.user ?? null);
      });
      sub = res?.data?.subscription;
    } catch {}
    return () => { mounted = false; sub?.unsubscribe?.(); };
  }, []);

  const fetchOrders = useCallback(async () => {
    let currentUser = user;
    if (!currentUser?.id) {
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          currentUser = data.user;
          setUser(currentUser);
        }
      } catch {}
    }
    if (!currentUser?.id) {
      setOrders([]);
      return [];
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const normalized = (data || []).map(normalizeOrder);
      setOrders(normalized);
      return normalized;
    } catch (e) {
      setOrders([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const createOrder = useCallback(async ({ packageType, packageDetail, amount }) => {
    let currentUser = user;
    if (!currentUser?.id) {
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          currentUser = data.user;
          setUser(currentUser);
        }
      } catch {}
    }
    if (!currentUser?.id) throw new Error('Chưa đăng nhập');
    const orderCode = 'DH' + String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();
    const { data, error } = await supabase
      .from('payment_orders')
      .insert([
        {
          user_id: currentUser.id,
          order_code: orderCode,
          package_type: packageType,
          package_detail: packageDetail,
          amount,
          status: 'pending',
          expires_at: expiresAt,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    const normalized = normalizeOrder(data);
    setOrders((prev) => [normalized, ...prev]);
    return normalized;
  }, [user]);

  return { user, orders, loading, createOrder, fetchOrders };
}

export default usePaymentOrders;
