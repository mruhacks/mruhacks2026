'use server';

/**
 * Read-only access to the audit log for the admin viewer. Everything here is
 * gated on `audit:read:all`; nothing in the app ever updates or deletes an
 * audit row.
 */

import { db } from '@/utils/db';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import * as Rbac from '@/lib/rbac/server';
import { serverActionError } from '@/utils/server-action-error';

const AUDIT_READ_PERMISSION = 'audit:read:all';

export interface ListAuditLogParams {
  /** Matches the action, target type/id, or the actor's name/email. */
  search?: string;
  actions?: string[];
  targetTypes?: string[];
  actorId?: string;
  page?: number;
  pageSize?: number;
  sortDirection?: 'asc' | 'desc';
}

export interface AuditLogRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  /** Null when the actor was a system job or has since been deleted. */
  actor: { id: string; name: string; email: string } | null;
}

export interface ListAuditLogResult {
  entries: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Paginated, filterable audit log, newest first by default. */
export async function listAuditLog(params: ListAuditLogParams = {}): Promise<ActionResult<ListAuditLogResult>> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, AUDIT_READ_PERMISSION);

    const { search = '', actions, targetTypes, actorId, page = 1, pageSize = 50, sortDirection = 'desc' } = params;

    const clampedPageSize = Math.min(Math.max(pageSize, 1), 200);
    const clampedPage = Math.max(page, 1);

    const predicates = [] as ReturnType<typeof eq>[];
    if (search.trim().length > 0) {
      const needle = `%${search.trim()}%`;
      predicates.push(
        or(
          ilike(schema.auditLog.action, needle),
          ilike(schema.auditLog.targetType, needle),
          ilike(schema.auditLog.targetId, needle),
          ilike(schema.user.name, needle),
          ilike(schema.user.email, needle),
        ) as ReturnType<typeof eq>,
      );
    }
    if (actions && actions.length > 0) {
      predicates.push(inArray(schema.auditLog.action, actions));
    }
    if (targetTypes && targetTypes.length > 0) {
      predicates.push(inArray(schema.auditLog.targetType, targetTypes));
    }
    if (actorId) predicates.push(eq(schema.auditLog.actorId, actorId));

    const whereClause = predicates.length ? and(...predicates) : sql`true`;
    const orderFn = sortDirection === 'asc' ? asc : desc;

    // The actor join is needed by the count too, since search can match on
    // the actor's name/email.
    const [countRow, rows] = await Promise.all([
      db
        .select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(schema.auditLog)
        .leftJoin(schema.user, eq(schema.auditLog.actorId, schema.user.id))
        .where(whereClause),
      db
        .select({
          id: schema.auditLog.id,
          action: schema.auditLog.action,
          targetType: schema.auditLog.targetType,
          targetId: schema.auditLog.targetId,
          metadata: schema.auditLog.metadata,
          createdAt: schema.auditLog.createdAt,
          actorId: schema.user.id,
          actorName: schema.user.name,
          actorEmail: schema.user.email,
        })
        .from(schema.auditLog)
        .leftJoin(schema.user, eq(schema.auditLog.actorId, schema.user.id))
        .where(whereClause)
        // id breaks ties so rows written in the same instant page stably.
        .orderBy(orderFn(schema.auditLog.createdAt), orderFn(schema.auditLog.id))
        .limit(clampedPageSize)
        .offset((clampedPage - 1) * clampedPageSize),
    ]);
    const total = countRow[0]?.total ?? 0;

    const entries: AuditLogRow[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata ?? null,
      createdAt: r.createdAt,
      actor:
        r.actorId && r.actorName != null && r.actorEmail != null
          ? { id: r.actorId, name: r.actorName, email: r.actorEmail }
          : null,
    }));

    return ok({
      entries,
      total,
      page: clampedPage,
      pageSize: clampedPageSize,
      totalPages: Math.max(1, Math.ceil(total / clampedPageSize)),
    });
  } catch (e) {
    return serverActionError('list audit log', e);
  }
}

/** Distinct actions and target types ever logged, for the filter pickers. */
export async function listAuditLogFacets(): Promise<ActionResult<{ actions: string[]; targetTypes: string[] }>> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, AUDIT_READ_PERMISSION);

    const [actionRows, targetTypeRows] = await Promise.all([
      db.selectDistinct({ value: schema.auditLog.action }).from(schema.auditLog).orderBy(asc(schema.auditLog.action)),
      db
        .selectDistinct({ value: schema.auditLog.targetType })
        .from(schema.auditLog)
        .orderBy(asc(schema.auditLog.targetType)),
    ]);

    return ok({
      actions: actionRows.map((r) => r.value),
      targetTypes: targetTypeRows.map((r) => r.value),
    });
  } catch (e) {
    return serverActionError('list audit log filters', e);
  }
}
