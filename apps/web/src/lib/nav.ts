import {
  Activity, BarChart3, Baby, BedDouble, Building2, CalendarDays, ClipboardCheck, ClipboardList, CreditCard, Droplets, FileCheck2,
  FileText, FlaskConical, HeartPulse, Home, LayoutDashboard, ListOrdered, Package, Pill, Receipt, ScanLine, Scissors, Settings,
  ShieldAlert, ShoppingCart, Video, MessageSquare, BellRing, Upload, Globe, Stethoscope, Users, UserCog, Wallet, Landmark, Briefcase, PiggyBank, History, Tags, Handshake,
} from 'lucide-react';
import { Accessibility, Ambulance, Archive, Droplet, HeartHandshake, Ribbon, ShieldCheck, Syringe, UtensilsCrossed } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: React.ElementType; roles?: string[] }
export interface NavGroup { label: string; items: NavItem[] }

const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'TRIAGE_NURSE'];
export const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'Front office', items: [
    { href: '/patients', label: 'Patients', icon: Users, roles: ['RECEPTION', ...CLIN, 'CASHIER', 'CLAIMS_OFFICER'] },
    { href: '/queue', label: 'Queue', icon: ListOrdered, roles: ['RECEPTION', ...CLIN, 'LAB_TECH', 'PHARMACIST', 'CASHIER'] },
    { href: '/appointments', label: 'Appointments', icon: CalendarDays, roles: ['RECEPTION', ...CLIN] },
  ] },
  { label: 'Engagement', items: [
    { href: '/telemedicine', label: 'Telemedicine', icon: Video, roles: ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTION'] },
    { href: '/messaging/templates', label: 'Message templates', icon: MessageSquare, roles: ['MANAGER', 'RECEPTION'] },
    { href: '/messaging/reminders', label: 'Reminders log', icon: BellRing, roles: ['MANAGER', 'RECEPTION'] },
  ] },
  { label: 'Clinical', items: [
    { href: '/opd', label: 'OPD', icon: Stethoscope, roles: CLIN },
    { href: '/lab', label: 'Laboratory', icon: FlaskConical, roles: ['LAB_TECH', 'DOCTOR', 'CLINICAL_OFFICER'] },
    { href: '/radiology', label: 'Radiology', icon: ScanLine, roles: ['RADIOGRAPHER', 'DOCTOR', 'CLINICAL_OFFICER'] },
    { href: '/pharmacy', label: 'Pharmacy', icon: Pill, roles: ['PHARMACIST'] },
    { href: '/ipd', label: 'Inpatient (IPD)', icon: BedDouble, roles: ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER'] },
    { href: '/maternity', label: 'Maternity', icon: Baby, roles: CLIN },
    { href: '/theatre', label: 'Theatre', icon: Scissors, roles: ['DOCTOR', 'NURSE'] },
    { href: '/dialysis', label: 'Dialysis', icon: Droplets, roles: ['DOCTOR', 'NURSE'] },
    { href: '/homecare', label: 'Homecare', icon: Home, roles: ['DOCTOR', 'NURSE', 'CLINICAL_OFFICER'] },
    { href: '/blood-bank', label: 'Blood bank', icon: Droplet, roles: ['LAB_TECH', 'DOCTOR', 'CLINICAL_OFFICER', 'NURSE'] },
    { href: '/hiv-tb', label: 'HIV & TB', icon: Ribbon, roles: ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'] },
    { href: '/fp-ncd', label: 'FP & NCD clinics', icon: HeartHandshake, roles: CLIN },
    { href: '/oncology', label: 'Oncology', icon: Syringe, roles: ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'PHARMACIST'] },
    { href: '/rehab', label: 'Physio & rehab', icon: Accessibility, roles: ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'] },
    { href: '/dietetics', label: 'Kitchen & diet', icon: UtensilsCrossed, roles: ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'STOREKEEPER'] },
    { href: '/cssd', label: 'CSSD', icon: ShieldCheck, roles: ['NURSE', 'DOCTOR', 'STOREKEEPER'] },
    { href: '/ambulance', label: 'Ambulance / EMS', icon: Ambulance, roles: ['RECEPTION', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'TRIAGE_NURSE'] },
    { href: '/mortuary', label: 'Mortuary', icon: Archive, roles: ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'RECEPTION'] },
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
    { href: '/finance/financing', label: 'Receivables financing', icon: Handshake, roles: ['ACCOUNTANT', 'MANAGER'] },
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
    { href: '/admin/subscription', label: 'Subscription', icon: CreditCard, roles: ['ADMIN'] },
    { href: '/admin/import', label: 'Import data', icon: Upload, roles: ['ADMIN'] },
    { href: '/admin/break-glass', label: 'Break-glass review', icon: ShieldAlert, roles: ['ADMIN'] },
  ] },
  { label: 'Platform', items: [
    { href: '/superadmin', label: 'Tenants', icon: Globe, roles: ['__SUPERADMIN__'] },
    { href: '/superadmin/invoices', label: 'Subscription invoices', icon: Receipt, roles: ['__SUPERADMIN__'] },
  ] },
];
export const ROLES = ['ADMIN','RECEPTION','TRIAGE_NURSE','NURSE','DOCTOR','CLINICAL_OFFICER','LAB_TECH','RADIOGRAPHER','PHARMACIST','CASHIER','CLAIMS_OFFICER','STOREKEEPER','PROCUREMENT','ACCOUNTANT','HR','MANAGER'];
export { HeartPulse, ClipboardList, FileText, CreditCard };
