import { serializeInstant } from '@/lib/datetime';
import { isSubeventRunning } from '@/lib/subevent-running';
import { dietaryRestrictionsList, type DietaryRestriction } from '@/types/lookups';

export const MISSED_MEAL_THRESHOLDS = [1, 2, 3, 4, 5] as const;
export const DEFAULT_MISSED_MEAL_THRESHOLD = 2;

export const NO_RESTRICTIONS_LABEL = 'No restrictions';
export const TOTAL_LABEL = 'Total';

type Meal = {
  id: string;
  name: string;
  startsAt: string;
};

export type ReportRow = {
  userId: string;
  name: string;
  restrictions: DietaryRestriction[];
  otherText: string | null;
  atDoor: boolean;
  lastSeenAt: string | null;
  missedStreak: number;
  missedMeals: Meal[];
  notAtCurrentMeal: boolean;
};

export type Report = {
  rows: ReportRow[];
  countedMealCount: number;
  currentMeal: Meal | null;
  hasMeals: boolean;
};

type DietarySummaryRow = {
  label: string;
  expected: number;
  atDoor: number;
  notAtDoor: number;
  missed: number;
};

export function parseMissedThreshold(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return MISSED_MEAL_THRESHOLDS.some((option) => option === parsed) ? parsed : DEFAULT_MISSED_MEAL_THRESHOLD;
}

export type ReportSource = {
  mainEventId: string;
  eventEndsAt: Date | null;
  participants: {
    userId: string;
    name: string;
    restrictions: DietaryRestriction[];
    otherText: string | null;
  }[];
  meals: { id: string; name: string; startsAt: Date; endsAt: Date | null }[];
  checkIns: { eventId: string; userId: string; checkedInAt: Date }[];
  now: Date;
};

function toRef(meal: { id: string; name: string; startsAt: Date }) {
  return {
    id: meal.id,
    name: meal.name,
    startsAt: serializeInstant(meal.startsAt),
  };
}

export function buildDietaryReport({
  mainEventId,
  eventEndsAt,
  participants,
  meals,
  checkIns,
  now,
}: ReportSource): Report {
  const nowMs = now.getTime();

  const attendees = new Map<string, Set<string>>();
  const door = new Map<string, Date>();
  const lastSeen = new Map<string, Date>();

  for (const row of checkIns) {
    if (row.eventId === mainEventId) door.set(row.userId, row.checkedInAt);

    const present = attendees.get(row.eventId) ?? new Set<string>();
    present.add(row.userId);
    attendees.set(row.eventId, present);

    const seen = lastSeen.get(row.userId);
    if (!seen || seen < row.checkedInAt) lastSeen.set(row.userId, row.checkedInAt);
  }

  const started = meals
    .filter((meal) => meal.startsAt.getTime() <= nowMs)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const counted = started.filter((meal) => (attendees.get(meal.id)?.size ?? 0) > 0);

  const eventOver = eventEndsAt !== null && eventEndsAt.getTime() <= nowMs;
  const current = eventOver ? null : (counted.findLast((meal) => isSubeventRunning(meal, nowMs)) ?? null);

  const streakMeals = current ? counted.slice(0, -1) : counted;

  const rows = participants.map((person) => {
    const doorAt = door.get(person.userId) ?? null;
    const missedMeals: Meal[] = [];

    if (doorAt) {
      for (let i = streakMeals.length - 1; i >= 0; i -= 1) {
        const meal = streakMeals[i];
        if (meal.startsAt <= doorAt) break;
        if (attendees.get(meal.id)?.has(person.userId)) break;
        missedMeals.push(toRef(meal));
      }
    }

    return {
      userId: person.userId,
      name: person.name,
      restrictions: person.restrictions,
      otherText: person.otherText,
      atDoor: doorAt !== null,
      lastSeenAt: serializeInstant(lastSeen.get(person.userId) ?? null),
      missedStreak: missedMeals.length,
      missedMeals,
      notAtCurrentMeal: current !== null && doorAt !== null && !attendees.get(current.id)?.has(person.userId),
    };
  });

  return {
    rows,
    countedMealCount: streakMeals.length,
    currentMeal: current ? toRef(current) : null,
    hasMeals: meals.length > 0,
  };
}

export function summarizeDietaryReport(rows: ReportRow[], threshold: number): DietarySummaryRow[] {
  const tally = (label: string, subset: ReportRow[]) => ({
    label,
    expected: subset.length,
    atDoor: subset.filter((row) => row.atDoor).length,
    notAtDoor: subset.filter((row) => !row.atDoor).length,
    missed: subset.filter((row) => row.missedStreak >= threshold).length,
  });

  return [
    ...dietaryRestrictionsList.map((label) =>
      tally(
        label,
        rows.filter((row) => row.restrictions.includes(label)),
      ),
    ),
    tally(
      NO_RESTRICTIONS_LABEL,
      rows.filter((row) => row.restrictions.length === 0),
    ),
    tally(TOTAL_LABEL, rows),
  ];
}
