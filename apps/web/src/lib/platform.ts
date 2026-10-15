import { Building2, History, LayoutDashboard, Stethoscope } from 'lucide-react';
import type { NavGroup } from './nav';

/** Sidebar of the JMSURF platform console (super admins only). */
export const PLATFORM_NAV: NavGroup[] = [
  { label: 'Platform', items: [
    { href: '/platform', label: 'Overview', short: 'Overview', icon: LayoutDashboard },
    { href: '/platform/tenants', label: 'Tenants', icon: Building2 },
    { href: '/platform/audit', label: 'Platform audit', short: 'Audit', icon: History },
  ] },
  { label: 'My facility', items: [{ href: '/dashboard', label: 'Back to the hospital app', short: 'App', icon: Stethoscope }] },
];
export const PLATFORM_BOTTOM = ['/platform', '/platform/tenants', '/platform/audit', '/dashboard'];
export const PLANS = ['CLINIC', 'HOSPITAL', 'ENTERPRISE'];
export const SUB_STATUSES = ['TRIAL', 'ACTIVE', 'GRACE', 'READ_ONLY', 'CANCELLED'];
export const daysLeft = (d?: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);
