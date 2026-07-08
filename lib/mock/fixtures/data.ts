/**
 * Declarative demo data for "Negocio Demo". Dates are expressed as day
 * offsets from the moment the store is (re)seeded, so overdue/pending/paid
 * relationships stay correct no matter when the app or test suite runs.
 *
 * Sized deliberately (~8 customers, ~12 invoices spanning all 4 statuses,
 * several payments mixing partial and full) so every status and balance
 * scenario is demonstrable out of the box — this replaced an earlier,
 * too-thin fixture draft that could not show all 4 statuses at once.
 */

export const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
export const DEMO_USER_ID = "20000000-0000-4000-8000-000000000001";
export const DEMO_PROFILE_ID = "30000000-0000-4000-8000-000000000001";

export const businessFixture = {
  id: BUSINESS_ID,
  name: "Negocio Demo",
  email: "contacto@negociodemo.test",
  phone: "3000000000",
  address: "Calle 10 # 20-30, Bogota",
  currency: "COP",
};

export const demoProfileFixture = {
  id: DEMO_PROFILE_ID,
  userId: DEMO_USER_ID,
  businessId: BUSINESS_ID,
  fullName: "Usuario Demo",
  email: "demo@negociodemo.test",
};

export type CustomerFixture = {
  id: string;
  name: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

function customerId(n: number): string {
  return `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const customerFixtures: CustomerFixture[] = [
  {
    id: customerId(1),
    name: "Ana Gomez",
    documentNumber: "1000000001",
    email: "ana.gomez@example.com",
    phone: "3001111111",
    address: "Cra 1 # 2-3",
    notes: null,
    isActive: true,
  },
  {
    id: customerId(2),
    name: "Carlos Perez",
    documentNumber: "1000000002",
    email: "carlos.perez@example.com",
    phone: "3002222222",
    address: "Cra 2 # 3-4",
    notes: null,
    isActive: true,
  },
  {
    id: customerId(3),
    name: "Diana Ramirez",
    documentNumber: "1000000003",
    email: "diana.ramirez@example.com",
    phone: "3003333333",
    address: "Cra 3 # 4-5",
    notes: "Cliente frecuente",
    isActive: true,
  },
  {
    id: customerId(4),
    name: "Eduardo Torres",
    documentNumber: "1000000004",
    email: "eduardo.torres@example.com",
    phone: "3004444444",
    address: "Cra 4 # 5-6",
    notes: "Ya no opera con nosotros",
    isActive: false,
  },
  {
    id: customerId(5),
    name: "Fernanda Lopez",
    documentNumber: "1000000005",
    email: "fernanda.lopez@example.com",
    phone: "3005555555",
    address: "Cra 5 # 6-7",
    notes: null,
    isActive: true,
  },
  {
    id: customerId(6),
    name: "Gabriel Nino",
    documentNumber: "1000000006",
    email: "gabriel.nino@example.com",
    phone: "3006666666",
    address: "Cra 6 # 7-8",
    notes: null,
    isActive: true,
  },
  {
    id: customerId(7),
    name: "Helena Castro",
    documentNumber: "1000000007",
    email: "helena.castro@example.com",
    phone: "3007777777",
    address: "Cra 7 # 8-9",
    notes: "Cuenta inactiva temporalmente",
    isActive: false,
  },
  {
    id: customerId(8),
    name: "Ivan Rodriguez",
    documentNumber: "1000000008",
    email: "ivan.rodriguez@example.com",
    phone: "3008888888",
    address: "Cra 8 # 9-10",
    notes: null,
    isActive: true,
  },
];

export type InvoiceItemFixture = {
  description: string;
  quantity: number;
  unitPrice: number; // integer cents
};

export type PaymentFixture = {
  amount: number; // integer cents
  dayOffset: number;
  method: string;
  notes: string | null;
};

export type InvoiceFixture = {
  id: string;
  customerId: string;
  issueDayOffset: number;
  dueDayOffset: number | null;
  items: InvoiceItemFixture[];
  notes: string | null;
  payments: PaymentFixture[];
};

function invoiceId(n: number): string {
  return `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * 12 invoices, 3 per status:
 * - pending (1-3): no payments, due date null or in the future
 * - overdue (4-6): no payments, due date in the past
 * - partially_paid (7-9): at least one payment, balance > 0 (one is also
 *   past due, to prove partially_paid takes precedence over overdue)
 * - paid (10-12): balance == 0 (single or multiple payments summing to total)
 */
export const invoiceFixtures: InvoiceFixture[] = [
  // -- pending --
  {
    id: invoiceId(1),
    customerId: customerId(1),
    issueDayOffset: -5,
    dueDayOffset: 20,
    items: [{ description: "Corte y peinado", quantity: 1, unitPrice: 300000 }],
    notes: null,
    payments: [],
  },
  {
    id: invoiceId(2),
    customerId: customerId(2),
    issueDayOffset: -3,
    dueDayOffset: 10,
    items: [{ description: "Manicure", quantity: 1, unitPrice: 150000 }],
    notes: null,
    payments: [],
  },
  {
    id: invoiceId(3),
    customerId: customerId(3),
    issueDayOffset: -2,
    dueDayOffset: null,
    items: [
      { description: "Consultoria", quantity: 2, unitPrice: 300000 },
      { description: "Materiales", quantity: 1, unitPrice: 200000 },
    ],
    notes: "Sin fecha de vencimiento definida",
    payments: [],
  },
  // -- overdue --
  {
    id: invoiceId(4),
    customerId: customerId(4),
    issueDayOffset: -45,
    dueDayOffset: -15,
    items: [{ description: "Mantenimiento", quantity: 1, unitPrice: 200000 }],
    notes: null,
    payments: [],
  },
  {
    id: invoiceId(5),
    customerId: customerId(5),
    issueDayOffset: -30,
    dueDayOffset: -5,
    items: [{ description: "Instalacion", quantity: 3, unitPrice: 150000 }],
    notes: null,
    payments: [],
  },
  {
    id: invoiceId(6),
    customerId: customerId(6),
    issueDayOffset: -60,
    dueDayOffset: -30,
    items: [{ description: "Revision tecnica", quantity: 1, unitPrice: 120000 }],
    notes: null,
    payments: [],
  },
  // -- partially_paid --
  {
    id: invoiceId(7),
    customerId: customerId(7),
    issueDayOffset: -40,
    dueDayOffset: -10, // past due, but a payment exists -> stays partially_paid
    items: [{ description: "Diseno grafico", quantity: 1, unitPrice: 500000 }],
    notes: "Vencida pero con abono; debe quedar partially_paid, no overdue",
    payments: [{ amount: 200000, dayOffset: -8, method: "cash", notes: "Abono inicial" }],
  },
  {
    id: invoiceId(8),
    customerId: customerId(1),
    issueDayOffset: -10,
    dueDayOffset: 15,
    items: [
      { description: "Producto A", quantity: 4, unitPrice: 100000 },
      { description: "Producto B", quantity: 2, unitPrice: 100000 },
    ],
    notes: null,
    payments: [{ amount: 100000, dayOffset: -2, method: "transfer", notes: null }],
  },
  {
    id: invoiceId(9),
    customerId: customerId(2),
    issueDayOffset: -6,
    dueDayOffset: null,
    items: [{ description: "Asesoria", quantity: 1, unitPrice: 250000 }],
    notes: null,
    payments: [{ amount: 50000, dayOffset: -1, method: "cash", notes: null }],
  },
  // -- paid --
  {
    id: invoiceId(10),
    customerId: customerId(3),
    issueDayOffset: -25,
    dueDayOffset: -20, // fully paid before/at due date -> paid, not overdue
    items: [{ description: "Pintura", quantity: 1, unitPrice: 400000 }],
    notes: null,
    payments: [{ amount: 400000, dayOffset: -18, method: "transfer", notes: "Pago completo" }],
  },
  {
    id: invoiceId(11),
    customerId: customerId(8),
    issueDayOffset: -8,
    dueDayOffset: 5,
    items: [{ description: "Reparacion", quantity: 1, unitPrice: 350000 }],
    notes: null,
    payments: [
      { amount: 200000, dayOffset: -3, method: "cash", notes: "Primer abono" },
      { amount: 150000, dayOffset: -1, method: "cash", notes: "Saldo final" },
    ],
  },
  {
    id: invoiceId(12),
    customerId: customerId(5),
    issueDayOffset: -15,
    dueDayOffset: null,
    items: [{ description: "Proyecto especial", quantity: 1, unitPrice: 900000 }],
    notes: null,
    payments: [
      { amount: 500000, dayOffset: -10, method: "transfer", notes: "Anticipo" },
      { amount: 400000, dayOffset: -2, method: "cash", notes: "Pago final" },
    ],
  },
];
