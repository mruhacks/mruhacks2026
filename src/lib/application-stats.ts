/**
 * Pure aggregation helpers for the event application "Stats" tab.
 *
 * No DB access, no React — this module only ever receives plain data and
 * returns plain data, so it can be exercised exhaustively by unit tests and
 * is safe to call from a server action after it has done its own querying
 * and permission checks.
 *
 * `buildQuestionStats` is the first (and, as of writing, only) caller of
 * `resolveShowInReports` (`src/types/application.ts`) — the predicate that
 * decides whether a question's answers are ever aggregated. Do not
 * reimplement that rule here.
 */

import {
  resolveShowInReports,
  type ApplicationQuestion,
  type ApplicationQuestionOption,
  type ApplicationQuestionType,
} from '@/types/application';
import { isOtherOption, otherTextKey } from '@/lib/other-option';
import { participationStatusesList } from '@/types/lookups';

/**
 * Minimal row shape this module needs. The caller (a server action) maps its
 * joined DB query result onto this — kept intentionally narrow so that
 * mapping is a one-line projection away from whatever join shape it builds.
 *
 * `responses` mirrors `eventParticipants.responses`: a nullable JSONB object
 * keyed by question UUID (plus `${questionId}__other` sibling keys for
 * "Other" free text). `status`/`university`/`major`/`yearOfStudy`/`gender`
 * are already-resolved display strings (not lookup ids).
 */
export type ApplicationStatsRow = {
  responses: Record<string, unknown> | null;
  status: string | null;
  university: string | null;
  major: string | null;
  yearOfStudy: string | null;
  gender: string | null;
};

export type StatsBucket = {
  key: string;
  label: string;
  count: number;
  percent: number;
  isOther?: boolean;
  otherTexts?: string[];
  inactive?: boolean;
};

export type QuestionStats = {
  questionId: string;
  label: string;
  type: ApplicationQuestionType;
  /** Applications in scope (rows passed in), regardless of whether answered. */
  total: number;
  /** Non-null/non-undefined answers. `total - answered` = "no response". */
  answered: number;
  buckets: StatsBucket[];
  numeric?: { min: number; max: number; mean: number; median: number };
};

const UNKNOWN_KEY = 'unknown';
const UNKNOWN_LABEL = 'Unknown';

/** `count / denominator` as a 0–100 percentage, guarded against 0/0 -> NaN. */
function percentOf(count: number, denominator: number): number {
  return denominator > 0 ? (count / denominator) * 100 : 0;
}

/**
 * One bucket per authored option, in authored order, so options nobody
 * picked (zero count) and options later deactivated still render. `active:
 * false` options are kept and flagged `inactive`; an option whose label
 * reads as "Other" (see `isOtherOption`) is flagged `isOther` so free text
 * collected during row iteration lands on the right bucket.
 */
function seedOptionBuckets(
  options: ApplicationQuestionOption[] = [],
): Map<string, StatsBucket> {
  const buckets = new Map<string, StatsBucket>();
  for (const option of options) {
    const bucket: StatsBucket = {
      key: option.value,
      label: option.label,
      count: 0,
      percent: 0,
    };
    if (option.active === false) bucket.inactive = true;
    if (isOtherOption(option.label)) bucket.isOther = true;
    buckets.set(option.value, bucket);
  }
  return buckets;
}

/**
 * Looks up the bucket for a stored answer value, creating one keyed by the
 * raw value when it doesn't match any known option — the case where an
 * option was deleted from the question after old responses were recorded.
 * Never drops the answer.
 */
function getOrCreateBucket(
  buckets: Map<string, StatsBucket>,
  value: unknown,
): StatsBucket {
  const key = String(value);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { key, label: key, count: 0, percent: 0 };
    buckets.set(key, bucket);
  }
  return bucket;
}

function finalizeBuckets(
  buckets: Map<string, StatsBucket>,
  denominator: number,
): StatsBucket[] {
  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    percent: percentOf(bucket.count, denominator),
  }));
}

function buildSelectStats(
  question: ApplicationQuestion,
  rows: ApplicationStatsRow[],
  total: number,
  multi: boolean,
): QuestionStats {
  const bucketMap = seedOptionBuckets(question.options);
  let answered = 0;

  for (const row of rows) {
    const responses = row.responses ?? {};
    const raw = responses[question.id];
    if (raw === null || raw === undefined) continue;

    // multi_select answers are arrays; single_select answers are scalars.
    // A malformed (non-array) multi_select answer is treated as unanswered
    // rather than crashing.
    const values = multi ? (Array.isArray(raw) ? raw : []) : [raw];
    if (values.length === 0) continue;

    answered++;
    const otherText = responses[otherTextKey(question.id)];
    for (const value of values) {
      const bucket = getOrCreateBucket(bucketMap, value);
      bucket.count++;
      if (bucket.isOther && typeof otherText === 'string' && otherText.trim()) {
        (bucket.otherTexts ??= []).push(otherText);
      }
    }
  }

  return {
    questionId: question.id,
    label: question.label,
    type: question.type,
    total,
    answered,
    // Percent denominator is respondents (`answered`), not selections — for
    // multi_select this means bucket percentages can legitimately sum past
    // 100%, since one respondent can land in several buckets.
    buckets: finalizeBuckets(bucketMap, answered),
  };
}

function buildBooleanStats(
  question: ApplicationQuestion,
  rows: ApplicationStatsRow[],
  total: number,
): QuestionStats {
  let yes = 0;
  let no = 0;

  for (const row of rows) {
    const responses = row.responses ?? {};
    const value = responses[question.id];
    // Strict equality — `false` is a valid, answered value and must not be
    // treated the same as "unanswered" just because it's falsy.
    if (value === true) yes++;
    else if (value === false) no++;
  }

  const answered = yes + no;
  const buckets: StatsBucket[] = [
    {
      key: 'true',
      label: 'Yes',
      count: yes,
      percent: percentOf(yes, answered),
    },
    { key: 'false', label: 'No', count: no, percent: percentOf(no, answered) },
  ];

  return {
    questionId: question.id,
    label: question.label,
    type: question.type,
    total,
    answered,
    buckets,
  };
}

const NUMBER_HISTOGRAM_BUCKETS = 5;

function formatNumberForLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildNumberHistogram(
  values: number[],
  min: number,
  max: number,
  answered: number,
): StatsBucket[] {
  if (values.length === 0) return [];

  if (min === max) {
    const label = formatNumberForLabel(min);
    return [
      {
        key: label,
        label,
        count: values.length,
        percent: percentOf(values.length, answered),
      },
    ];
  }

  const width = (max - min) / NUMBER_HISTOGRAM_BUCKETS;
  const counts = new Array<number>(NUMBER_HISTOGRAM_BUCKETS).fill(0);
  for (const value of values) {
    let index = Math.floor((value - min) / width);
    if (index >= NUMBER_HISTOGRAM_BUCKETS) index = NUMBER_HISTOGRAM_BUCKETS - 1;
    if (index < 0) index = 0;
    counts[index]++;
  }

  return counts.map((count, index) => {
    const rangeStart = min + index * width;
    const rangeEnd =
      index === NUMBER_HISTOGRAM_BUCKETS - 1 ? max : min + (index + 1) * width;
    const label = `${formatNumberForLabel(rangeStart)}–${formatNumberForLabel(rangeEnd)}`;
    return {
      key: `bucket-${index}`,
      label,
      count,
      percent: percentOf(count, answered),
    };
  });
}

function buildNumberStats(
  question: ApplicationQuestion,
  rows: ApplicationStatsRow[],
  total: number,
): QuestionStats {
  const values: number[] = [];

  for (const row of rows) {
    const responses = row.responses ?? {};
    const raw = responses[question.id];
    if (raw === null || raw === undefined) continue;
    const num = typeof raw === 'number' ? raw : Number(raw);
    // Non-numeric / NaN answers are treated as unanswered rather than
    // corrupting min/max/mean/median.
    if (Number.isFinite(num)) values.push(num);
  }

  const answered = values.length;

  const numeric =
    values.length === 0
      ? { min: 0, max: 0, mean: 0, median: 0 }
      : (() => {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
          const sorted = [...values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          const median =
            sorted.length % 2 === 0
              ? (sorted[mid - 1] + sorted[mid]) / 2
              : sorted[mid];
          return { min, max, mean, median };
        })();

  return {
    questionId: question.id,
    label: question.label,
    type: question.type,
    total,
    answered,
    buckets: buildNumberHistogram(values, numeric.min, numeric.max, answered),
    numeric,
  };
}

function buildOneQuestionStats(
  question: ApplicationQuestion,
  rows: ApplicationStatsRow[],
  total: number,
): QuestionStats {
  switch (question.type) {
    case 'single_select':
      return buildSelectStats(question, rows, total, false);
    case 'multi_select':
      return buildSelectStats(question, rows, total, true);
    case 'boolean':
      return buildBooleanStats(question, rows, total);
    case 'number':
      return buildNumberStats(question, rows, total);
    default:
      // Unreachable in practice: `resolveShowInReports` already restricts
      // callers to `isSummarizableQuestion` types (single_select |
      // multi_select | number | boolean). Kept exhaustive rather than
      // asserted so a future question type fails a test loudly instead of
      // silently rendering nothing.
      return {
        questionId: question.id,
        label: question.label,
        type: question.type,
        total,
        answered: 0,
        buckets: [],
      };
  }
}

/**
 * Aggregates responses for every question flagged `showInReports` (via
 * `resolveShowInReports`, which already excludes free-text/section-divider
 * questions and defaults an unset flag to `false`). Questions not flagged
 * are simply absent from the result — never rendered as an empty chart.
 */
export function buildQuestionStats(
  questions: ApplicationQuestion[],
  rows: ApplicationStatsRow[],
): QuestionStats[] {
  const total = rows.length;
  return questions
    .filter((question) => resolveShowInReports(question))
    .map((question) => buildOneQuestionStats(question, rows, total));
}

/**
 * Participation-status counts. Seeded from every known `ParticipationStatus`
 * (`src/types/lookups.ts`) so a status with zero applications still renders
 * as an explicit 0 rather than vanishing from the breakdown — the same
 * "zero-count is retained" rule applied to question option buckets. A row
 * with a `status` outside the known set (or `null`) is bucketed under
 * `"unknown"` rather than dropped.
 */
export function buildStatusBreakdown(
  rows: ApplicationStatsRow[],
): StatsBucket[] {
  const bucketMap = new Map<string, StatsBucket>();
  for (const status of participationStatusesList) {
    bucketMap.set(status, { key: status, label: status, count: 0, percent: 0 });
  }

  for (const row of rows) {
    const key = row.status ?? UNKNOWN_KEY;
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = { key, label: key, count: 0, percent: 0 };
      bucketMap.set(key, bucket);
    }
    bucket.count++;
  }

  return finalizeBuckets(bucketMap, rows.length);
}

type DemographicField = 'university' | 'major' | 'yearOfStudy' | 'gender';

function buildFieldBreakdown(
  rows: ApplicationStatsRow[],
  field: DemographicField,
): StatsBucket[] {
  const bucketMap = new Map<string, StatsBucket>();

  for (const row of rows) {
    const raw = row[field];
    const hasValue = typeof raw === 'string' && raw.trim().length > 0;
    const key = hasValue ? raw : UNKNOWN_KEY;
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: hasValue ? raw : UNKNOWN_LABEL,
        count: 0,
        percent: 0,
      };
      bucketMap.set(key, bucket);
    }
    bucket.count++;
  }

  return finalizeBuckets(bucketMap, rows.length);
}

/**
 * Applicant demographic breakdowns (university / major / year of study /
 * gender), one bucket set per field. A missing value is bucketed under
 * `"unknown"` rather than dropped, so counts still sum to `rows.length` per
 * field.
 */
export function buildDemographicStats(
  rows: ApplicationStatsRow[],
): Record<DemographicField, StatsBucket[]> {
  return {
    university: buildFieldBreakdown(rows, 'university'),
    major: buildFieldBreakdown(rows, 'major'),
    yearOfStudy: buildFieldBreakdown(rows, 'yearOfStudy'),
    gender: buildFieldBreakdown(rows, 'gender'),
  };
}
