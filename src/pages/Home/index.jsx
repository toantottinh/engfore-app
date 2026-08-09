import React from 'react';
import { Link } from 'react-router-dom';

const features = [
  {
    title: 'Học chủ động',
    desc: 'Không cần suy nghĩ hôm nay học gì. Mở EngFore và bắt đầu luyện tập ngay với các bộ từ vựng của bạn.',
  },
  {
    title: 'Ghi nhớ lâu dài',
    desc: 'Luyện tập chủ động với chế độ gõ từ và thẻ ghi nhớ giúp bạn nhớ từ vựng lâu hơn.',
  },
  {
    title: 'Tổ chức linh hoạt',
    desc: 'Tạo các bộ từ vựng riêng theo chủ đề, dễ dàng tìm kiếm và sắp xếp.',
  },
];

const steps = [
  { n: '1', title: 'Tạo bộ từ', desc: 'Tạo bộ từ vựng theo chủ đề bạn muốn học.' },
  { n: '2', title: 'Thêm từ', desc: 'Thêm từ tiếng Anh kèm IPA, nghĩa tiếng Việt và ví dụ.' },
  { n: '3', title: 'Luyện tập', desc: 'Gõ từ, lật thẻ ghi nhớ để ghi nhớ hiệu quả.' },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
              Học từ vựng tiếng Anh{' '}
              <span className="text-indigo-600">không còn nhàm chán</span>
            </h1>
            <p className="mt-4 text-lg text-zinc-600">
              EngFore giúp bạn ghi nhớ từ vựng qua luyện tập chủ động — gõ từ và thẻ ghi nhớ.
              Đúng với triết lý: <strong>Chơi mà học</strong>.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-base font-medium text-white hover:bg-indigo-700 sm:w-auto"
              >
                Bắt đầu học từ vựng
              </Link>
              <Link
                to="/login"
                className="w-full rounded-lg border border-zinc-300 bg-white px-6 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
              >
                Đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Giá trị sản phẩm */}
      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-zinc-900">
            Vì sao chọn EngFore?
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <h3 className="text-base font-semibold text-zinc-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cách hoạt động */}
      <section className="bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-zinc-900">Cách hoạt động</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
                  {s.n}
                </div>
                <h3 className="mt-4 text-base font-semibold text-zinc-900">{s.title}</h3>
                <p className="mt-1 text-sm text-zinc-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-200 bg-indigo-600">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-white">Sẵn sàng bắt đầu?</h2>
          <p className="mt-2 text-indigo-100">
            Tạo tài khoản miễn phí và bắt đầu học từ vựng ngay hôm nay.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-base font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Bắt đầu học từ vựng
          </Link>
        </div>
      </section>
    </div>
  );
}
