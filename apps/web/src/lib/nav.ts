import {
  Activity, BarChart3, Baby, BedDouble, Building2, CalendarDays, ClipboardCheck, ClipboardList, CreditCard, Droplets, FileCheck2,
  FileText, FlaskConical, HeartPulse, Home, LayoutDashboard, ListOrdered, Package, Pill, Receipt, ScanLine, Scissors, Settings,
  ShieldAlert, ShoppingCart, Stethoscope, Users, Video, UserCog, Wallet, Landmark, Briefcase, PiggyBank, History, Tags, Handshake,
} from 'lucide-react';
import { REGISTERS } from './registers';

export interface NavItem { href: string; label: string; icon: React.ElementType; roles?: string[]; short?: string; pill?: string }
export interface NavGroup { label: string; items: NavItem[] }

const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'TRIAGE_NURSE'];
const reg = (group: string): NavGroup => ({ label: group, items: REGISTERS.filter((r) => r.group === group).map((r) => ({ href: `/r/${r.key}`, label: r.label, icon: r.icon, roles: r.roles })) });
const BASE: NavGroup[] = [
  { label: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard }] },
  { label: 'Front office', items: [
    { href: '/patients', label: 'Patients', icon: Users, roles: ['RECEPTION', ...CLIN, 'CASHIER', 'CLAIMS_OFFICER'] },
    { href: '/queue', label: 'Queue', icon: ListOrdered, roles: ['RECEPTION', ...CLIN, 'LAB_TECH', 'PHARMACIST', 'CASHIER'] },
    { href: '/appointments', label: 'Appointments', icon: CalendarDays, roles: ['RECEPTION', ...CLIN] },
  ] },
  { label: 'Clinical', items: [
    { href: '/opd', label: 'Outpatient (OPD)', short: 'OPD', icon: Stethoscope, roles: CLIN },
    { href: '/lab', label: 'Laboratory', icon: FlaskConical, roles: ['LAB_TECH', 'DOCTOR', 'CLINICAL_OFFICER'] },
    { href: '/radiology', label: 'Radiology', icon: ScanLine, roles: ['RADIOGRAPHER', 'DOCTOR', 'CLINICAL_OFFICER'] },
    { href: '/pharmacy', label: 'Pharmacy', icon: Pill, roles: ['PHARMACIST'] },
    { href: '/ipd', label: 'Inpatient (IPD)', icon: BedDouble, roles: ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER'] },
    { href: '/maternity', label: 'Maternity', icon: Baby, roles: CLIN },
    { href: '/theatre', label: 'Theatre', icon: Scissors, roles: ['DOCTOR', 'NURSE'] },
    { href: '/dialysis', label: 'Dialysis', icon: Droplets, roles: ['DOCTOR', 'NURSE'] },
    { href: '/homecare', label: 'Homecare', icon: Home, roles: ['DOCTOR', 'NURSE', 'CLINICAL_OFFICER'] },
    { href: '/telemedicine', label: 'Telemedicine', icon: Video, roles: [...CLIN, 'RECEPTION'] },
  ] },
  { label: 'Revenue', items: [
    { href: '/billing', label: 'Billing', icon: Receipt, roles: ['CASHIER', 'RECEPTION', 'ACCOUNTANT', 'CLAIMS_OFFICER'] },
    { href: '/cashier', label: 'Cashier', icon: Wallet, roles: ['CASHIER'] },
    { href: '/claims', label: 'Claims', icon: FileCheck2, roles: ['CLAIMS_OFFICER', 'ACCOUNTANT', 'MANAGER'] },
    { href: '/preauth', label: 'Pre-authorisation', icon: ClipboardCheck, roles: ['CLAIMS_OFFICER', 'DOCTOR'] },
  ] },
  { label: 'Supply chain', items: [
    { href: '/inventory', label: 'Inventory', icon: Package, roles: ['STOREKEEPER', 'PHARMACIST', 'PROCUREMENT', 'MANAGER'] },
    { href: '/procurement', label: 'Procurement', icon: ShoppingCart, roles: ['PROCUREMENT', 'STOREKEEPER', 'MANAGER', 'ACCOUNTANT'] },
  ] },
  { label: 'Back office', items: [
    { href: '/finance', label: 'Finance', icon: Landmark, roles: ['ACCOUNTANT', 'MANAGER'] },
    { href: '/hr', label: 'HR & Payroll', icon: Briefcase, roles: ['HR', 'MANAGER'] },
    { href: '/assets', label: 'Assets', icon: Building2, roles: ['ACCOUNTANT', 'MANAGER', 'STOREKEEPER'] },
    { href: '/budgets', label: 'Budgets', icon: PiggyBank, roles: ['ACCOUNTANT', 'MANAGER'] },
  ] },
  { label: 'Insights', items: [
    { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['MANAGER', 'ACCOUNTANT', 'DOCTOR'] },
    { href: '/quality', label: 'Quality & incidents', icon: ShieldAlert },
  ] },
  { label: 'Administration', items: [
    { href: '/admin', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
    { href: '/admin/facilities', label: 'Facilities', icon: Building2, roles: ['ADMIN'] },
    { href: '/admin/departments', label: 'Departments', icon: Activity, roles: ['ADMIN'] },
    { href: '/admin/users', label: 'Users & roles', icon: UserCog, roles: ['ADMIN'] },
    { href: '/admin/prices', label: 'Price lists', icon: Tags, roles: ['ADMIN'] },
    { href: '/admin/payers', label: 'Payers & schemes', icon: Handshake, roles: ['ADMIN'] },
    { href: '/admin/audit', label: 'Audit log', icon: History, roles: ['ADMIN'] },
    { href: '/admin/subscription', label: 'Subscription', icon: CreditCard, roles: ['ADMIN', 'ACCOUNTANT'] },
  ] },
];
/** Sidebar order: core clinical first, then the register-based modules, then revenue and back office. */
const at = (label: string) => BASE.find((g) => g.label === label)!;
export const NAV: NavGroup[] = [
  at('Overview'), at('Front office'), at('Clinical'), reg('Specialty clinics'), reg('Programmes'), reg('Blood bank'), reg('Support services'), reg('Records & documents'),
  at('Revenue'), at('Supply chain'), at('Back office'), at('Insights'), reg('Quality & operations'), at('Administration'),
];
export const ROLES = ['ADMIN','RECEPTION','TRIAGE_NURSE','NURSE','DOCTOR','CLINICAL_OFFICER','LAB_TECH','RADIOGRAPHER','PHARMACIST','CASHIER','CLAIMS_OFFICER','STOREKEEPER','PROCUREMENT','ACCOUNTANT','HR','MANAGER'];
export { HeartPulse, ClipboardList, FileText, CreditCard };

/** Phone bottom bar: the first four of these the user can open, then "More". */
export const BOTTOM = ['/dashboard', '/patients', '/queue', '/opd', '/billing', '/pharmacy', '/lab', '/reports'];
