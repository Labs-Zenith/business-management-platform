import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { Session } from "@/lib/services/ports";
import { createEmployee, updateEmployee } from "./employee-service";
import { createPayrollPayment, listPayrollPayments } from "./payroll-service";

/**
 * SAFETY-CRITICAL: exercises the REAL mock store (not a mocked repository)
 * so the atomic payment->expense linkage is an observable fact, mirroring
 * `payment-service.test.ts`'s technique.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: BUSINESS_ID,
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("createPayrollPayment (payroll-service)", () => {
  it("derives the correct period range for a quincenal reference date and writes BOTH rows", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });

    const payment = await createPayrollPayment(SESSION, {
      employeeId: employee.id,
      amount: 1000000,
      periodType: "quincenal",
      referenceDate: "2026-07-05",
      paymentDate: "2026-07-16",
      notes: "Primera quincena",
    });

    expect(payment.periodStart).toBe("2026-07-01");
    expect(payment.periodEnd).toBe("2026-07-15");
    expect(payment.businessId).toBe(BUSINESS_ID);

    const persistedPayment = store.payrollPayments.get(payment.id);
    expect(persistedPayment).toBeDefined();
    const linkedExpense = [...store.expenses.values()].find((e) => e.description.includes(employee.name));
    expect(linkedExpense).toBeDefined();
    expect(linkedExpense!.category).toBe("nomina");
    expect(linkedExpense!.amount).toBe(1000000);
  });

  it("derives the correct period range for a mensual reference date", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Natalia Fernandez", baseSalary: 2200000 });

    const payment = await createPayrollPayment(SESSION, {
      employeeId: employee.id,
      amount: 2200000,
      periodType: "mensual",
      referenceDate: "2026-02-10",
      paymentDate: "2026-03-01",
    });

    expect(payment.periodStart).toBe("2026-02-01");
    expect(payment.periodEnd).toBe("2026-02-28");
  });

  it("rejects an unknown employeeId with NOT_FOUND, creating nothing", async () => {
    resetStore();
    const paymentsBefore = store.payrollPayments.size;
    const expensesBefore = store.expenses.size;

    await expect(
      createPayrollPayment(SESSION, {
        employeeId: "70000000-0000-4000-8000-000000000999",
        amount: 1000000,
        periodType: "quincenal",
        referenceDate: "2026-07-05",
        paymentDate: "2026-07-16",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(store.payrollPayments.size).toBe(paymentsBefore);
    expect(store.expenses.size).toBe(expensesBefore);
  });

  it("rejects a payment for an inactive employee with VALIDATION_ERROR, creating nothing — this is server-side enforcement, independent of the UI's active-employees-only dropdown filter", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });
    await updateEmployee(SESSION, employee.id, { active: false });
    const paymentsBefore = store.payrollPayments.size;
    const expensesBefore = store.expenses.size;

    await expect(
      createPayrollPayment(SESSION, {
        employeeId: employee.id,
        amount: 1000000,
        periodType: "quincenal",
        referenceDate: "2026-07-05",
        paymentDate: "2026-07-16",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(store.payrollPayments.size).toBe(paymentsBefore);
    expect(store.expenses.size).toBe(expensesBefore);
  });

  it("rejects a cross-business employeeId with NOT_FOUND", async () => {
    resetStore();
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    const employee = await createEmployee(otherSession, { name: "De otro negocio", baseSalary: 1500000 });

    await expect(
      createPayrollPayment(SESSION, {
        employeeId: employee.id,
        amount: 1000000,
        periodType: "quincenal",
        referenceDate: "2026-07-05",
        paymentDate: "2026-07-16",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a zero amount with VALIDATION_ERROR, persisting nothing", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });
    const paymentsBefore = store.payrollPayments.size;

    await expect(
      createPayrollPayment(SESSION, {
        employeeId: employee.id,
        amount: 0,
        periodType: "quincenal",
        referenceDate: "2026-07-05",
        paymentDate: "2026-07-16",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(store.payrollPayments.size).toBe(paymentsBefore);
  });

  it("rejects a negative amount with VALIDATION_ERROR", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });

    await expect(
      createPayrollPayment(SESSION, {
        employeeId: employee.id,
        amount: -500,
        periodType: "quincenal",
        referenceDate: "2026-07-05",
        paymentDate: "2026-07-16",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a non-integer amount with VALIDATION_ERROR", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });

    await expect(
      createPayrollPayment(SESSION, {
        employeeId: employee.id,
        amount: 1000.5,
        periodType: "quincenal",
        referenceDate: "2026-07-05",
        paymentDate: "2026-07-16",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("propagates ApiError instances (not generic Errors)", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });

    await expect(
      createPayrollPayment(SESSION, {
        employeeId: employee.id,
        amount: -1,
        periodType: "quincenal",
        referenceDate: "2026-07-05",
        paymentDate: "2026-07-16",
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("propagates a repository-level create() rejection cleanly — no silent success, no partial state left behind", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });
    const paymentsBefore = store.payrollPayments.size;
    const expensesBefore = store.expenses.size;

    const createSpy = vi
      .spyOn(repositories.payroll, "create")
      .mockRejectedValueOnce(new Error("simulated repository failure"));

    try {
      await expect(
        createPayrollPayment(SESSION, {
          employeeId: employee.id,
          amount: 1000000,
          periodType: "quincenal",
          referenceDate: "2026-07-05",
          paymentDate: "2026-07-16",
        }),
      ).rejects.toThrow("simulated repository failure");

      // No partial/fabricated state: the store must be untouched, since the
      // repository call that would have written both rows never resolved.
      expect(store.payrollPayments.size).toBe(paymentsBefore);
      expect(store.expenses.size).toBe(expensesBefore);
    } finally {
      createSpy.mockRestore();
    }
  });
});

describe("listPayrollPayments (payroll-service)", () => {
  it("lists only the session business's payroll payments", async () => {
    resetStore();
    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });
    await createPayrollPayment(SESSION, {
      employeeId: employee.id,
      amount: 1000000,
      periodType: "quincenal",
      referenceDate: "2026-07-05",
      paymentDate: "2026-07-16",
    });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    const otherEmployee = await createEmployee(otherSession, { name: "Ajeno", baseSalary: 1500000 });
    await createPayrollPayment(otherSession, {
      employeeId: otherEmployee.id,
      amount: 999999,
      periodType: "quincenal",
      referenceDate: "2026-07-05",
      paymentDate: "2026-07-16",
    });

    const result = await listPayrollPayments(SESSION, { page: 1, pageSize: 20 });

    expect(result.data.every((p) => p.businessId === BUSINESS_ID)).toBe(true);
    expect(result.data.some((p) => p.employee.name === "Ajeno")).toBe(false);
  });
});
