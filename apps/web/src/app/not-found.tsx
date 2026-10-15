import Link from 'next/link';
export default function NotFound() {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3"><h1 className="text-2xl font-semibold">Page not found</h1><Link href="/dashboard" className="btn-primary">Back to dashboard</Link></div>;
}
