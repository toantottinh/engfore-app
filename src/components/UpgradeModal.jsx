import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase.js';
import { BANK_ID, ACCOUNT_NO, ACCOUNT_NAME } from '../constants/payment.js';
import { copyTextToClipboard } from '../utils/vocabulary-ai-prompt.js';
import useUserPlan from '../hooks/useUserPlan.js';
import usePaymentOrders from '../hooks/usePaymentOrders.js';

const WORD_PACKAGES = [
  { amount: 10000, words: 500, label: '10k', tag: null },
  { amount: 15000, words: 1000, label: '15k', tag: null },
  { amount: 22000, words: 2000, label: '22k', tag: null },
  { amount: 33000, words: 3000, label: '33k', tag: null },
  { amount: 44000, words: 5000, label: '44k', tag: 'Tặng 1 tháng tắt Ads' },
  { amount: 55000, words: 8000, label: '55k', tag: 'Tặng 4 tháng tắt Ads' },
];

const ADS_PACKAGES = [
  { amount: 10000, months: 1, label: '10k', desc: '1 tháng' },
  { amount: 20000, months: 4, label: '20k', desc: '4 tháng' },
  { amount: 30000, months: 12, label: '30k', desc: '1 năm', tag: 'Tiết kiệm nhất' },
];

export default function UpgradeModal({ open, isOpen, onClose, initialTab }) {
  const visible = open ?? isOpen ?? false;
  const { user, shortUserId, refetchPlan } = useUserPlan();
  const { orders, loading: ordersLoading, createOrder, fetchOrders } = usePaymentOrders();

  const [mainTab, setMainTab] = useState('packages');
  const [pkgTab, setPkgTab] = useState('words');
  const [selected, setSelected] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const handledOrderRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setMainTab('packages');
      setPkgTab(initialTab === 'ads' ? 'ads' : 'words');
      setSelected(null);
      setCurrentOrder(null);
      setSuccessMsg('');
      setToast('');
    }
  }, [visible]);

  useEffect(() => {
    if (mainTab === 'history') fetchOrders();
  }, [mainTab, fetchOrders]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const packages = pkgTab === 'words' ? WORD_PACKAGES : ADS_PACKAGES;

  const handleCopy = async (text, msg) => {
    const ok = await copyTextToClipboard(text);
    setToast(ok ? msg : 'Không thể sao chép, hãy copy thủ công.');
  };

  const handlePay = async () => {
    if (!selected) return;
    setCreating(true);
    try {
      const order = await createOrder({
        packageType: pkgTab === 'words' ? 'quota' : 'ads',
        packageDetail: pkgTab === 'words' ? `+${selected.words} từ` : selected.desc,
        amount: selected.amount,
      });
      setCurrentOrder(order);
    } catch (e) {
      setToast('Không thể tạo đơn, vui lòng thử lại.');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!currentOrder?.id) return;
    const channel = supabase
      .channel(`payment_order_${currentOrder.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'payment_orders', filter: `id=eq.${currentOrder.id}` },
        (payload) => {
          const updated = payload.new;
          setCurrentOrder(updated);
          if (updated.status === 'completed' && handledOrderRef.current !== updated.id) {
            handledOrderRef.current = updated.id;
            handleOrderCompleted(updated);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrder?.id]);

  const handleOrderCompleted = async (order) => {
    if (!user?.id) return;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('word_quota, ad_free_until')
        .eq('id', user.id)
        .maybeSingle();
      let words = selected?.words ?? 0;
      let months = selected?.months ?? 0;
      if (!selected) {
        const detail = String(order.package_detail || '');
        const num = parseInt(detail.replace(/[^\d]/g, ''), 10) || 0;
        if (order.package_type === 'quota') words = num;
        else if (order.package_type === 'ads') {
          if (/năm/i.test(detail)) months = num * 12;
          else months = num;
        }
      }
      if (order.package_type === 'quota') {
        const newQuota = (profile?.word_quota ?? 500) + words;
        await supabase.from('profiles').update({ word_quota: newQuota }).eq('id', user.id);
      } else if (order.package_type === 'ads') {
        const baseDate =
          profile?.ad_free_until && new Date(profile.ad_free_until) > new Date()
            ? new Date(profile.ad_free_until)
            : new Date();
        baseDate.setMonth(baseDate.getMonth() + months);
        await supabase.from('profiles').update({ ad_free_until: baseDate.toISOString() }).eq('id', user.id);
      }
      await refetchPlan?.();
      setSuccessMsg('Nạp thành công!');
    } catch (e) {
      setToast('Lỗi đồng bộ dữ liệu.');
    }
  };

  const isExpired = (order) => {
    if (!order) return false;
    if (order.status !== 'pending') return order.status === 'expired';
    const created = new Date(order.created_at).getTime();
    return Date.now() - created > 24 * 60 * 60 * 1000;
  };

  const statusLabel = (order) => {
    const st = isExpired(order) ? 'expired' : order.status;
    if (st === 'completed') return 'Hoàn thành';
    if (st === 'expired') return 'Hết hạn';
    return 'Chờ thanh toán';
  };

  const viewOrderQR = (order) => {
    setCurrentOrder(order);
    setMainTab('packages');
  };

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-2xl bg-surface-sidebar shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">Nâng cấp</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary" aria-label="Đóng">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 pt-4">
          <div className="flex gap-2 rounded-lg bg-surface-default p-1">
            <button type="button" onClick={() => { setMainTab('packages'); setCurrentOrder(null); setSuccessMsg(''); }} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${mainTab === 'packages' ? 'bg-brand-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>Chọn gói</button>
            <button type="button" onClick={() => { setMainTab('history'); setCurrentOrder(null); setSuccessMsg(''); }} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${mainTab === 'history' ? 'bg-brand-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>Lịch sử nạp</button>
          </div>
        </div>
        <div className="p-5">
          {successMsg ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="text-4xl">🎉</div>
              <p className="text-lg font-semibold text-text-primary">{successMsg}</p>
              <button type="button" onClick={() => { setSuccessMsg(''); setCurrentOrder(null); }} className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white">Đóng</button>
            </div>
          ) : currentOrder ? (
            <div className="flex flex-col items-center gap-4">
              <img
                src={`https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${currentOrder.amount}&addInfo=${encodeURIComponent(currentOrder.order_code)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`}
                alt="VietQR"
                className="h-56 w-56 rounded-lg border border-border-color bg-white object-contain"
              />
              <div className="w-full space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-default px-3 py-2">
                  <span className="truncate text-text-secondary">Mã đơn: <span className="font-medium text-text-primary">{currentOrder.order_code}</span></span>
                  <button type="button" onClick={() => handleCopy(currentOrder.order_code, 'Đã sao chép mã đơn')} className="rounded-md bg-brand-primary px-2 py-1 text-xs font-medium text-white">Sao chép cú pháp</button>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-default px-3 py-2">
                  <span className="truncate text-text-secondary">STK: <span className="font-medium text-text-primary">{ACCOUNT_NO}</span></span>
                  <button type="button" onClick={() => handleCopy(ACCOUNT_NO, 'Đã sao chép số tài khoản')} className="rounded-md bg-brand-primary px-2 py-1 text-xs font-medium text-white">Sao chép số tài khoản</button>
                </div>
              </div>
              <p className="text-xs text-text-secondary">Hệ thống sẽ kích hoạt dung lượng sau khi xác nhận chuyển khoản thành công.</p>
              <button type="button" onClick={() => setCurrentOrder(null)} className="text-sm text-text-secondary underline">Quay lại</button>
            </div>
          ) : mainTab === 'history' ? (
            <div className="space-y-2">
              {ordersLoading ? (
                <div className="py-8 text-center text-sm text-text-secondary">Đang tải...</div>
              ) : orders.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-secondary">Chưa có giao dịch nào.</div>
              ) : (
                <ul className="space-y-2">
                  {orders.map((order) => (
                    <li key={order.id} className="rounded-xl border border-border-color bg-surface-default p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-text-primary">{order.order_code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isExpired(order) ? 'bg-gray-200 text-gray-600' : order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {statusLabel(order)}
                        </span>
                      </div>
                      <div className="mt-1 text-text-secondary">
                        {order.package_detail} — {Number(order.amount).toLocaleString('vi-VN')}đ
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {new Date(order.created_at).toLocaleString('vi-VN')}
                      </div>
                      {order.status === 'pending' && !isExpired(order) && (
                        <button type="button" onClick={() => viewOrderQR(order)} className="mt-2 rounded-md bg-brand-primary px-3 py-1 text-xs font-medium text-white">
                          Xem lại mã QR
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 rounded-lg bg-surface-default p-1">
                <button type="button" onClick={() => { setPkgTab('words'); setSelected(null); }} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pkgTab === 'words' ? 'bg-brand-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>Mua thêm từ vựng</button>
                <button type="button" onClick={() => { setPkgTab('ads'); setSelected(null); }} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pkgTab === 'ads' ? 'bg-brand-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>Tắt quảng cáo & Focus Mode</button>
              </div>
              <div className="space-y-2">
                {packages.map((pkg, idx) => {
                  const isActive = selected && selected.amount === pkg.amount;
                  return (
                    <button key={idx} type="button" onClick={() => setSelected(pkg)} className={`w-full rounded-xl border p-3 text-left transition-colors ${isActive ? 'border-brand-primary bg-brand-primary/10' : 'border-border-color bg-surface-default hover:bg-surface-hover'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-text-primary">{pkgTab === 'words' ? `+${pkg.words.toLocaleString('vi-VN')} từ` : pkg.desc}</span>
                        <span className="text-sm font-medium text-brand-primary">{pkg.label}</span>
                      </div>
                      {pkg.tag && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{pkg.tag}</span>}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handlePay}
                disabled={!selected || creating}
                className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {creating ? 'Đang tạo đơn...' : 'Tiến hành thanh toán'}
              </button>
            </div>
          )}
        </div>
        {toast && <div className="px-5 pb-4"><div className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white">{toast}</div></div>}
      </div>
    </div>
  );
}

