import {
  BarChart3,
  CalendarCheck,
  CreditCard,
  MessageCircle,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Feature = { icon: LucideIcon; title: string; text: string };
export type Step = { title: string; text: string };
export type Faq = { q: string; a: string };

export const features: Feature[] = [
  {
    icon: Users,
    title: "Members and plans",
    text: "Keep every member, photo and membership term in one place. Set up plans with fees, admission charges and tax once, then enroll members in seconds. Import your existing list from a CSV.",
  },
  {
    icon: CreditCard,
    title: "Payments and receipts",
    text: "Record cash, UPI and bank transfers against what each member owes. Print or download receipts and bills, and see who has a balance due at a glance.",
  },
  {
    icon: CalendarCheck,
    title: "QR attendance",
    text: "Every member gets a card with a QR code. Reception scans it on a phone to mark attendance, with no app for members to install.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp reminders",
    text: "Prepare renewal and payment reminders in a click. Your staff send them from their own WhatsApp, and membrr records that they were sent.",
  },
  {
    icon: BarChart3,
    title: "Reports and exports",
    text: "See collections, renewals and dues by month. Filter, then export members and reports to CSV for your accountant.",
  },
  {
    icon: ShieldCheck,
    title: "Staff access with roles",
    text: "Owners control plans, settings and billing. Front-desk staff handle members, payments and attendance. Invite or remove people whenever you need to.",
  },
];

export const steps: Step[] = [
  {
    title: "Create your workspace",
    text: "Sign up with your email or Google account and name your gym or arena. No card needed.",
  },
  {
    title: "Add plans and members",
    text: "Set your membership plans, then add members one by one or import them from a spreadsheet.",
  },
  {
    title: "Collect and keep track",
    text: "Record payments, scan members in at the door and follow up on dues from one dashboard.",
  },
];

export function buildFaqs(feeLabel: string, trialDays: number): Faq[] {
  return [
    {
      q: "Does membrr take online payments from my members?",
      a: "No. Staff record the cash, UPI and bank transfers you already collect, and membrr keeps the ledger and receipts in rupees. Online payment through Razorpay is only used for your own membrr subscription.",
    },
    {
      q: "Who owns our member data?",
      a: "You do. Each business has its own isolated workspace, and owners can export their members to CSV at any time.",
    },
    {
      q: "How do WhatsApp reminders work?",
      a: "membrr prepares the message and opens WhatsApp with the member's number. A staff member sends it from their own WhatsApp, then marks it as sent. There is no extra WhatsApp account to set up.",
    },
    {
      q: "Can my front-desk staff use it too?",
      a: "Yes. Invite staff from Settings. Staff can manage members, payments and attendance, while owners keep control of plans, settings and billing.",
    },
    {
      q: "What happens after the free trial?",
      a: `You get a free trial of ${trialDays} days with no card required. After that, membrr is ${feeLabel} per month. Owners can choose a paid plan from the billing page at any time.`,
    },
  ];
}
