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

/**
 * Second business + membership for the SAME demo user (same `DEMO_USER_ID`,
 * same login `email`) — proves a user can hold N memberships and demos the
 * business switcher (UI wiring lands in a later PR).
 */
export const BUSINESS_ID_2 = "10000000-0000-4000-8000-000000000002";
export const DEMO_PROFILE_ID_2 = "30000000-0000-4000-8000-000000000002";

export const businessFixture = {
  id: BUSINESS_ID,
  name: "Negocio Demo",
  email: "contacto@negociodemo.test",
  phone: "3000000000",
  address: "Calle 10 # 20-30, Bogota",
  currency: "COP",
};

export const businessFixture2 = {
  id: BUSINESS_ID_2,
  name: "Negocio Demo 2",
  email: "contacto@negociodemo2.test",
  phone: "3000000001",
  address: "Calle 50 # 10-20, Medellin",
  currency: "COP",
};

export const demoProfileFixture = {
  id: DEMO_PROFILE_ID,
  userId: DEMO_USER_ID,
  businessId: BUSINESS_ID,
  fullName: "Usuario Demo",
  email: "demo@negociodemo.test",
  role: "admin" as const,
};

export const demoProfileFixture2 = {
  id: DEMO_PROFILE_ID_2,
  userId: DEMO_USER_ID,
  businessId: BUSINESS_ID_2,
  fullName: "Usuario Demo",
  email: "demo@negociodemo.test",
  // `worker` (not `admin`) so switching to this second business demonstrates
  // role-based nav filtering — Nómina and the audit-log panel are hidden for
  // workers. The first business (`demoProfileFixture`) stays `admin`, so the
  // same demo user holds different roles across their two memberships.
  role: "worker" as const,
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

export type ExpenseFixture = {
  id: string;
  category: "nomina" | "otro";
  description: string;
  amountInCents: number;
  dayOffset: number;
  notes: string | null;
};

function expenseId(n: number): string {
  return `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * A handful of demo expenses mixing `nomina`/`otro` categories across a few
 * different months, so the Egresos dashboard aggregation (total this month,
 * by-category, recent) has real data to show out of the box. Excluded from
 * `seedMinimal` (matches invoices/payments/customers — cookie-size reasons).
 */
export const expenseFixtures: ExpenseFixture[] = [
  {
    id: expenseId(1),
    category: "nomina",
    description: "Nomina quincenal - equipo operativo",
    amountInCents: 3500000,
    dayOffset: -3,
    notes: "Pago quincenal",
  },
  {
    id: expenseId(2),
    category: "otro",
    description: "Arriendo local",
    amountInCents: 1200000,
    dayOffset: -5,
    notes: null,
  },
  {
    id: expenseId(3),
    category: "otro",
    description: "Servicios publicos",
    amountInCents: 350000,
    dayOffset: -10,
    notes: "Agua, luz y gas",
  },
  {
    id: expenseId(4),
    category: "nomina",
    description: "Nomina quincenal - mes anterior",
    amountInCents: 3400000,
    dayOffset: -35,
    notes: null,
  },
  {
    id: expenseId(5),
    category: "otro",
    description: "Insumos y papeleria",
    amountInCents: 180000,
    dayOffset: -45,
    notes: null,
  },
];

export type EmployeeFixture = {
  id: string;
  name: string;
  baseSalary: number; // integer cents
  active: boolean;
};

function employeeId(n: number): string {
  return `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * A handful of demo employees (mostly active, one inactive) so the Nomina
 * page has real data to show out of the box — excluded from `seedMinimal`
 * (matches invoices/payments/expenses — cookie-size reasons).
 */
export const employeeFixtures: EmployeeFixture[] = [
  { id: employeeId(1), name: "Laura Martinez", baseSalary: 2000000, active: true },
  { id: employeeId(2), name: "Miguel Sanchez", baseSalary: 1800000, active: true },
  { id: employeeId(3), name: "Natalia Fernandez", baseSalary: 2200000, active: true },
  { id: employeeId(4), name: "Oscar Jimenez", baseSalary: 1900000, active: false },
];

export type PayrollPaymentFixture = {
  id: string;
  employeeId: string;
  amount: number; // integer cents
  periodType: "quincenal" | "mensual";
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  paymentDayOffset: number;
  notes: string | null;
};

function payrollPaymentId(n: number): string {
  return `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * A small payroll payment history mixing quincenal/mensual periods across
 * different months, so the Pagos tab and the Egresos dashboard both have
 * real `category:'nomina'` data to show out of the box. Excluded from
 * `seedMinimal` (matches invoices/payments/expenses — cookie-size reasons).
 * `periodStart`/`periodEnd` are fixed calendar dates (not day-offsets, unlike
 * other fixtures) since they must stay internally consistent with the
 * `periodType` they claim.
 */
export const payrollPaymentFixtures: PayrollPaymentFixture[] = [
  {
    id: payrollPaymentId(1),
    employeeId: employeeId(1),
    amount: 1000000,
    periodType: "quincenal",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-15",
    paymentDayOffset: -25,
    notes: "Primera quincena de junio",
  },
  {
    id: payrollPaymentId(2),
    employeeId: employeeId(2),
    amount: 900000,
    periodType: "quincenal",
    periodStart: "2026-06-16",
    periodEnd: "2026-06-30",
    paymentDayOffset: -10,
    notes: "Segunda quincena de junio",
  },
  {
    id: payrollPaymentId(3),
    employeeId: employeeId(3),
    amount: 2200000,
    periodType: "mensual",
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    paymentDayOffset: -40,
    notes: "Nomina mensual de mayo",
  },
];

export type ProductFixture = {
  id: string;
  name: string;
  sku: string | null;
  unitCost: number; // integer cents
  active: boolean;
};

function productId(n: number): string {
  return `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * A handful of demo products mixing SKU-present/absent and varying stock
 * levels (including one within the fixed low-stock range, see
 * `lib/services/inventory-stock.ts`) so the Inventario page has real data to
 * show out of the box — excluded from `seedMinimal` (matches
 * invoices/payments/expenses/employees — cookie-size reasons).
 */
export const productFixtures: ProductFixture[] = [
  { id: productId(1), name: "Shampoo Profesional 1L", sku: "SHP-001", unitCost: 25000, active: true },
  { id: productId(2), name: "Tijera de Corte", sku: "TIJ-002", unitCost: 80000, active: true },
  { id: productId(3), name: "Toallas Desechables", sku: null, unitCost: 5000, active: true },
  { id: productId(4), name: "Secador de Cabello", sku: "SEC-004", unitCost: 150000, active: false },
];

export type InventoryMovementFixture = {
  id: string;
  productId: string;
  type: "in" | "out";
  quantity: number;
  dayOffset: number;
  note: string | null;
};

function inventoryMovementId(n: number): string {
  return `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * Seed movement history. Low-stock is now a FIXED rule (`1 <= quantity <= 3`,
 * see `lib/services/inventory-stock.ts`), not a per-product threshold.
 * Product 1 (Shampoo): +30 -8 = 22 (well above the low-stock range).
 * Product 2 (Tijera): +5 -4 = 1 (WITHIN the low-stock range — the one
 * deliberately low-stock demo product). Product 3 (Toallas): +50 -10 = 40
 * (above the low-stock range). Product 4 (inactive) has no movements at
 * all — computed quantity 0 (out of stock, not "low-stock" under the fixed
 * rule).
 */
export const inventoryMovementFixtures: InventoryMovementFixture[] = [
  { id: inventoryMovementId(1), productId: productId(1), type: "in", quantity: 30, dayOffset: -20, note: "Compra inicial" },
  { id: inventoryMovementId(2), productId: productId(1), type: "out", quantity: 8, dayOffset: -5, note: "Uso en salon" },
  { id: inventoryMovementId(3), productId: productId(2), type: "in", quantity: 5, dayOffset: -15, note: "Compra inicial" },
  { id: inventoryMovementId(4), productId: productId(2), type: "out", quantity: 4, dayOffset: -2, note: "Uso en salon" },
  { id: inventoryMovementId(5), productId: productId(3), type: "in", quantity: 50, dayOffset: -25, note: "Compra al por mayor" },
  { id: inventoryMovementId(6), productId: productId(3), type: "out", quantity: 10, dayOffset: -3, note: null },
];
