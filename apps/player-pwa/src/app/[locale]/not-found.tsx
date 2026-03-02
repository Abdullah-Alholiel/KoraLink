import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-bg p-8 text-center">
      <h2 className="text-4xl font-bold text-brand-black">404</h2>
      <p className="text-lg text-gray-600">الصفحة غير موجودة</p>
      <Link
        href="/"
        className="rounded-lg bg-brand-green px-6 py-2 text-white"
      >
        العودة للرئيسية
      </Link>
    </div>
  );
}
