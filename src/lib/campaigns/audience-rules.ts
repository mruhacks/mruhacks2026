import { z } from 'zod';

import { participationStatusesList } from '@/types/lookups';

/**
 * A campaign audience is a rule tree in react-querybuilder's `RuleGroupType`
 * shape, narrowed to the handful of fields we know how to compile:
 *
 *   { combinator: 'and' | 'or', not?: boolean, rules: [rule | group, …] }
 *   { field: 'participatedIn', operator: '=' | '!=', value: { … } }
 *
 * `operator: '!='` negates a single rule ("is NOT on a team for event X");
 * `not: true` negates a whole group. An empty group places no constraint.
 *
 * This module is shared by the builder UI and the server. The server always
 * re-validates with {@link audienceRulesSchema} before compiling, and never
 * accepts SQL (or anything SQL-shaped) from the client — see
 * `@/lib/campaigns/audience`.
 */

/** Deepest nesting allowed (the root group is depth 1). */
export const MAX_AUDIENCE_DEPTH = 5;
/** Most rules and groups allowed in one tree, counted together. */
export const MAX_AUDIENCE_NODES = 60;

export const AUDIENCE_FIELDS = [
  'participatedIn',
  'checkedIn',
  'onTeam',
  'marketingConsent',
  'hasRole',
] as const;
export type AudienceField = (typeof AUDIENCE_FIELDS)[number];

export const AUDIENCE_OPERATORS = ['=', '!='] as const;

const id = z.string().max(100).optional();
const operator = z.enum(AUDIENCE_OPERATORS);
const eventId = z.uuid();

const participatedInRule = z.object({
  id,
  field: z.literal('participatedIn'),
  operator,
  value: z.object({
    eventId,
    /** Effective statuses (an expired invitation reads as `timed_out`). Omitted or empty = any status. */
    statuses: z
      .array(z.enum(participationStatusesList))
      .max(participationStatusesList.length)
      .optional(),
  }),
});

const checkedInRule = z.object({
  id,
  field: z.literal('checkedIn'),
  operator,
  /** A top-level event or a sub-event. */
  value: z.object({ eventId }),
});

const onTeamRule = z.object({
  id,
  field: z.literal('onTeam'),
  operator,
  value: z.object({ eventId }),
});

const marketingConsentRule = z.object({
  id,
  field: z.literal('marketingConsent'),
  operator,
  value: z.object({ optedIn: z.boolean() }),
});

const hasRoleRule = z.object({
  id,
  field: z.literal('hasRole'),
  operator,
  /** Who receives the email — this is audience selection, never an authorization check. */
  value: z.object({ roleId: z.number().int().positive() }),
});

export const audienceRuleSchema = z.discriminatedUnion('field', [
  participatedInRule,
  checkedInRule,
  onTeamRule,
  marketingConsentRule,
  hasRoleRule,
]);
export type AudienceRule = z.infer<typeof audienceRuleSchema>;

export type AudienceRuleGroup = {
  id?: string;
  combinator: 'and' | 'or';
  not?: boolean;
  rules: (AudienceRule | AudienceRuleGroup)[];
};

const groupSchema: z.ZodType<AudienceRuleGroup> = z.lazy(() =>
  z.object({
    id,
    combinator: z.enum(['and', 'or']),
    not: z.boolean().optional(),
    rules: z
      .array(z.union([audienceRuleSchema, groupSchema]))
      .max(MAX_AUDIENCE_NODES),
  }),
);

export function isAudienceGroup(
  node: AudienceRule | AudienceRuleGroup,
): node is AudienceRuleGroup {
  return 'combinator' in node;
}

function measure(group: AudienceRuleGroup): { depth: number; nodes: number } {
  let depth = 1;
  let nodes = 1;
  for (const node of group.rules) {
    if (isAudienceGroup(node)) {
      const child = measure(node);
      depth = Math.max(depth, child.depth + 1);
      nodes += child.nodes;
    } else {
      nodes += 1;
    }
  }
  return { depth, nodes };
}

/** The whole tree, including the size limits that keep the compiled SQL bounded. */
export const audienceRulesSchema = groupSchema.superRefine((tree, ctx) => {
  const { depth, nodes } = measure(tree);
  if (depth > MAX_AUDIENCE_DEPTH) {
    ctx.addIssue({
      code: 'custom',
      message: `Groups can be nested at most ${MAX_AUDIENCE_DEPTH} deep.`,
    });
  }
  if (nodes > MAX_AUDIENCE_NODES) {
    ctx.addIssue({
      code: 'custom',
      message: `An audience can have at most ${MAX_AUDIENCE_NODES} rules and groups.`,
    });
  }
});

/** A new campaign's starting audience: no rules, so everyone the campaign type allows. */
export function emptyAudience(): AudienceRuleGroup {
  return { combinator: 'and', rules: [] };
}

/** Every event and role id a tree refers to, for checking they still exist. */
export function collectAudienceReferences(tree: AudienceRuleGroup): {
  eventIds: Set<string>;
  roleIds: Set<number>;
} {
  const eventIds = new Set<string>();
  const roleIds = new Set<number>();
  const visit = (group: AudienceRuleGroup) => {
    for (const node of group.rules) {
      if (isAudienceGroup(node)) visit(node);
      else if (node.field === 'hasRole') roleIds.add(node.value.roleId);
      else if ('eventId' in node.value) eventIds.add(node.value.eventId);
    }
  };
  visit(tree);
  return { eventIds, roleIds };
}
