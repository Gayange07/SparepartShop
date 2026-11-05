import type { FastifyInstance } from "fastify";
import { hash } from "argon2";
import { eq, and } from "drizzle-orm";
import { StaffUserInput, MechanicInput, AdvanceInput, ExpenseInput, MarkAttendanceInput, isCalendarDate } from "shared";
import { db } from "../db/client.js";
import { users, mechanics, advances, staffExpenses, attendance, payslips } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";
import { payrollForMonth, payrollRowFor } from "./payroll.js";

export default async function staffRoutes(app: FastifyInstance) {
  app.get("/api/staff", { preHandler: app.requireOwner }, async () => {
    const userRows = db.select().from(users).where(eq(users.role, "shopkeeper")).all()
      .map((u) => ({ ...u, passwordHash: undefined, staffType: "user" as const }));
    const mechanicRows = db.select().from(mechanics).all().map((m) => ({ ...m, staffType: "mechanic" as const }));
    return { staff: [...userRows, ...mechanicRows] };
  });

  app.post("/api/staff/users", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const parsed = StaffUserInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;
    if (!input.password) return reply.code(400).send({ error: "Set a login password for a new staff member" });

    const existing = db.select().from(users).where(eq(users.username, input.username)).get();
    if (existing) return reply.code(409).send({ error: "That username is already taken" });

    const [row] = db.insert(users).values({
      name: input.name, username: input.username, passwordHash: await hash(input.password),
      role: "shopkeeper", canStock: input.canStock, canCost: input.canCost,
      salaryCents: input.salaryCents, commissionPct: input.commissionPct,
      monthlyTargetCents: input.monthlyTargetCents, targetBonusCents: input.targetBonusCents,
      active: input.active, createdAt: new Date().toISOString(),
    }).returning().all();

    logActivity({ userId: owner.id, action: "staff_created", entityType: "user", entityId: row.id, details: { name: row.name } });
    reply.send({ staff: { ...row, passwordHash: undefined } });
  });

  app.put("/api/staff/users/:id", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const existing = db.select().from(users).where(eq(users.id, id)).get();
    if (!existing || existing.role !== "shopkeeper") return reply.code(404).send({ error: "Staff member not found" });

    const parsed = StaffUserInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    if (input.username !== existing.username) {
      const clash = db.select().from(users).where(eq(users.username, input.username)).get();
      if (clash) return reply.code(409).send({ error: "That username is already taken" });
    }

    const [row] = db.update(users).set({
      name: input.name, username: input.username,
      passwordHash: input.password ? await hash(input.password) : existing.passwordHash,
      canStock: input.canStock, canCost: input.canCost,
      salaryCents: input.salaryCents, commissionPct: input.commissionPct,
      monthlyTargetCents: input.monthlyTargetCents, targetBonusCents: input.targetBonusCents,
      active: input.active,
    }).where(eq(users.id, id)).returning().all();

    logActivity({ userId: owner.id, action: "staff_edited", entityType: "user", entityId: id, details: { name: row.name } });
    reply.send({ staff: { ...row, passwordHash: undefined } });
  });

  app.post("/api/staff/mechanics", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const parsed = MechanicInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

    const [row] = db.insert(mechanics).values({ ...parsed.data, createdAt: new Date().toISOString() }).returning().all();
    logActivity({ userId: owner.id, action: "staff_created", entityType: "mechanic", entityId: row.id, details: { name: row.name } });
    reply.send({ staff: row });
  });

  app.put("/api/staff/mechanics/:id", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const existing = db.select().from(mechanics).where(eq(mechanics.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Mechanic not found" });

    const parsed = MechanicInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

    const [row] = db.update(mechanics).set(parsed.data).where(eq(mechanics.id, id)).returning().all();
    logActivity({ userId: owner.id, action: "staff_edited", entityType: "mechanic", entityId: id, details: { name: row.name } });
    reply.send({ staff: row });
  });

  app.get("/api/payroll", { preHandler: app.requireOwner }, async (req, reply) => {
    const { period } = req.query as { period?: string };
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return reply.code(400).send({ error: "Pick a month" });
    return { rows: payrollForMonth(period) };
  });

  app.post("/api/advances", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const parsed = AdvanceInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const staffExists = input.staffType === "user"
      ? db.select().from(users).where(eq(users.id, input.staffId)).get()
      : db.select().from(mechanics).where(eq(mechanics.id, input.staffId)).get();
    if (!staffExists) return reply.code(404).send({ error: "Staff member not found" });

    const [row] = db.insert(advances).values({
      staffType: input.staffType, staffId: input.staffId, amountCents: input.amountCents,
      period: input.period, note: input.note, createdBy: owner.id, createdAt: new Date().toISOString(),
    }).returning().all();

    logActivity({ userId: owner.id, action: "advance_given", entityType: input.staffType, entityId: input.staffId, details: { amountCents: input.amountCents, period: input.period } });
    reply.send({ advance: row, payroll: payrollRowFor(input.staffType, input.staffId, input.period) });
  });

  // Expenses: list, add, delete
  app.get("/api/expenses", { preHandler: app.requireOwner }, async (req, reply) => {
    const { staffType, staffId, period } = req.query as { staffType?: string; staffId?: string; period?: string };
    let query = db.select().from(staffExpenses);
    const rows = query.all().filter((e) =>
      (!staffType || e.staffType === staffType) &&
      (!staffId || e.staffId === Number(staffId)) &&
      (!period || e.period === period)
    );
    return { expenses: rows };
  });

  app.post("/api/expenses", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const parsed = ExpenseInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const staffExists = input.staffType === "user"
      ? db.select().from(users).where(eq(users.id, input.staffId)).get()
      : db.select().from(mechanics).where(eq(mechanics.id, input.staffId)).get();
    if (!staffExists) return reply.code(404).send({ error: "Staff member not found" });

    const [row] = db.insert(staffExpenses).values({
      staffType: input.staffType, staffId: input.staffId, period: input.period,
      category: input.category, amountCents: input.amountCents, note: input.note,
      createdBy: owner.id, createdAt: new Date().toISOString(),
    }).returning().all();

    logActivity({ userId: owner.id, action: "advance_given", entityType: input.staffType, entityId: input.staffId, details: { type: "expense", category: input.category, amountCents: input.amountCents, period: input.period } });
    return { expense: row, payroll: payrollRowFor(input.staffType, input.staffId, input.period) };
  });

  app.delete("/api/expenses/:id", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const existing = db.select().from(staffExpenses).where(eq(staffExpenses.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Expense not found" });
    db.delete(staffExpenses).where(eq(staffExpenses.id, id)).run();
    logActivity({ userId: owner.id, action: "advance_given", entityType: existing.staffType, entityId: existing.staffId, details: { type: "expense_deleted", id } });
    return { ok: true, payroll: payrollRowFor(existing.staffType, existing.staffId, existing.period) };
  });

  // Attendance: get for a period, mark a day
  app.get("/api/attendance", { preHandler: app.requireOwner }, async (req, reply) => {
    const { staffType, staffId, period } = req.query as { staffType?: string; staffId?: string; period?: string };
    const rows = db.select().from(attendance).all().filter((r) =>
      (!staffType || r.staffType === staffType) &&
      (!staffId || r.staffId === Number(staffId)) &&
      (!period || r.date.startsWith(period))
    );
    return { attendance: rows };
  });

  app.post("/api/attendance", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const parsed = MarkAttendanceInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const staffExists = input.staffType === "user"
      ? db.select().from(users).where(eq(users.id, input.staffId)).get()
      : db.select().from(mechanics).where(eq(mechanics.id, input.staffId)).get();
    if (!staffExists) return reply.code(404).send({ error: "Staff member not found" });

    // Upsert: delete existing record for that date+staff then insert
    db.delete(attendance).where(and(
      eq(attendance.staffType, input.staffType),
      eq(attendance.staffId, input.staffId),
      eq(attendance.date, input.date),
    )).run();

    const [row] = db.insert(attendance).values({
      staffType: input.staffType, staffId: input.staffId,
      date: input.date, status: input.status, note: input.note,
      markedBy: owner.id, markedAt: new Date().toISOString(),
    }).returning().all();

    const period = input.date.slice(0, 7);
    return { attendance: row, payroll: payrollRowFor(input.staffType, input.staffId, period) };
  });

  app.delete("/api/attendance", { preHandler: app.requireOwner }, async (req, reply) => {
    const { staffType, staffId, date } = req.query as { staffType?: string; staffId?: string; date?: string };
    if (staffType !== "user" && staffType !== "mechanic") return reply.code(400).send({ error: "Invalid staff type" });
    if (!date || !isCalendarDate(date)) return reply.code(400).send({ error: "Pick a date" });
    const id = Number(staffId);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Pick a staff member" });
    db.delete(attendance).where(and(
      eq(attendance.staffType, staffType),
      eq(attendance.staffId, id),
      eq(attendance.date, date),
    )).run();
    return { ok: true, payroll: payrollRowFor(staffType, id, date.slice(0, 7)) };
  });

  app.post("/api/payroll/:staffType/:staffId/pay", { preHandler: app.requireOwner }, async (req, reply) => {
    const owner = req.session.user!;
    const { staffType, staffId } = req.params as { staffType: string; staffId: string };
    if (staffType !== "user" && staffType !== "mechanic") return reply.code(400).send({ error: "Invalid staff type" });
    const id = Number(staffId);
    const { period } = req.body as { period?: string };
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return reply.code(400).send({ error: "Pick a month" });

    const already = db.select().from(payslips).where(and(eq(payslips.staffType, staffType), eq(payslips.staffId, id), eq(payslips.period, period))).get();
    if (already) return reply.code(400).send({ error: "This month has already been paid" });

    const row = payrollRowFor(staffType, id, period);
    if (!row) return reply.code(404).send({ error: "Staff member not found" });

    const [slip] = db.insert(payslips).values({
      staffType, staffId: id, period,
      salaryCents: row.salaryCents, commissionCents: row.commission.commissionCents,
      targetBonusCents: row.commission.targetBonusCents, advancesDeductedCents: row.advancesDeductedCents,
      expensesCents: row.expensesCents, absenceDeductionCents: row.absenceDeductionCents,
      netCents: row.netCents, generatedAt: new Date().toISOString(),
    }).returning().all();

    logActivity({ userId: owner.id, action: "payslip_paid", entityType: staffType, entityId: id, details: { period, netCents: row.netCents } });
    reply.send({ payslip: slip });
  });

  app.get("/api/payroll/:staffType/:staffId/payslips", { preHandler: app.requireOwner }, async (req, reply) => {
    const { staffType, staffId } = req.params as { staffType: string; staffId: string };
    if (staffType !== "user" && staffType !== "mechanic") return reply.code(400).send({ error: "Invalid staff type" });
    const rows = db.select().from(payslips).where(and(eq(payslips.staffType, staffType), eq(payslips.staffId, Number(staffId)))).all();
    rows.sort((a, b) => b.period.localeCompare(a.period));
    reply.send({ payslips: rows });
  });
}
