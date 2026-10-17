import { describe, expect, test } from 'vitest';

import {
  DEFAULT_MISSED_MEAL_THRESHOLD,
  NO_RESTRICTIONS_LABEL,
  TOTAL_LABEL,
  buildDietaryReport,
  parseMissedThreshold,
  summarizeDietaryReport,
  type DietaryReportSource,
} from '@/lib/dietary/report';
import type { DietaryRestriction } from '@/types/lookups';

const EVENT = 'event-1';
const DAY = '2026-09-19';

function at(time: string) {
  return new Date(`${DAY}T${time}:00.000Z`);
}

function person(
  userId: string,
  restrictions: DietaryRestriction[] = [],
  otherText: string | null = null,
) {
  return { userId, name: `User ${userId}`, restrictions, otherText };
}

function source(overrides: Partial<DietaryReportSource> = {}) {
  return buildDietaryReport({
    mainEventId: EVENT,
    eventEndsAt: at('23:00'),
    participants: [],
    meals: [],
    checkIns: [],
    now: at('20:00'),
    ...overrides,
  });
}

const BREAKFAST = { id: 'breakfast', name: 'Breakfast', startsAt: at('08:00') };
const LUNCH = { id: 'lunch', name: 'Lunch', startsAt: at('12:00') };
const DINNER = { id: 'dinner', name: 'Dinner', startsAt: at('18:00') };

function doorScan(userId: string, time = '07:00') {
  return { eventId: EVENT, userId, checkedInAt: at(time) };
}

function mealScan(mealId: string, userId: string, time: string) {
  return { eventId: mealId, userId, checkedInAt: at(time) };
}

describe('parseMissedThreshold', () => {
  test('accepts 1-5', () => {
    expect(parseMissedThreshold('1')).toBe(1);
    expect(parseMissedThreshold('5')).toBe(5);
  });

  test('defaults on junk', () => {
    for (const value of [undefined, '', '0', '6', 'two', '2.5']) {
      expect(parseMissedThreshold(value)).toBe(DEFAULT_MISSED_MEAL_THRESHOLD);
    }
  });

  test('uses the first value if the param is repeated', () => {
    expect(parseMissedThreshold(['3', '1'])).toBe(3);
  });
});

describe('buildDietaryReport', () => {
  test('lists everyone, even if they skipped the door', () => {
    const report = source({
      participants: [person('a'), person('b')],
      checkIns: [doorScan('a')],
    });

    expect(report.rows.map((row) => row.userId)).toEqual(['a', 'b']);
    expect(report.rows[0].atDoor).toBe(true);
    expect(report.rows[1].atDoor).toBe(false);
  });

  test('last seen is the newest scan anywhere', () => {
    const report = source({
      meals: [LUNCH],
      participants: [person('a'), person('b')],
      checkIns: [
        doorScan('a'),
        mealScan('lunch', 'a', '12:30'),
        mealScan('workshop', 'a', '15:00'),
      ],
    });

    expect(report.rows[0].lastSeenAt).toBe(at('15:00').toISOString());
    expect(report.rows[1].lastSeenAt).toBeNull();
  });

  test('ignores a meal with no scans', () => {
    const report = source({
      meals: [BREAKFAST, LUNCH, DINNER],
      participants: [person('a')],
      checkIns: [doorScan('a'), mealScan('breakfast', 'a', '08:10')],
    });

    expect(report.countedMealCount).toBe(1);
    expect(report.rows[0].missedStreak).toBe(0);
  });

  test('current meal does not count', () => {
    const report = source({
      meals: [BREAKFAST, LUNCH, DINNER],
      participants: [person('a'), person('b')],
      checkIns: [
        doorScan('a'),
        doorScan('b'),
        mealScan('breakfast', 'a', '08:10'),
        mealScan('lunch', 'a', '12:10'),
        mealScan('dinner', 'a', '18:10'),
      ],
    });

    expect(report.currentMeal?.id).toBe('dinner');
    expect(report.countedMealCount).toBe(2);
    const b = report.rows[1];
    expect(b.missedStreak).toBe(2);
    expect(b.missedMeals.map((meal) => meal.name)).toEqual([
      'Lunch',
      'Breakfast',
    ]);
    expect(b.notAtCurrentMeal).toBe(true);
  });

  test('a later meal knocks the previous one off current', () => {
    const report = source({
      meals: [LUNCH, DINNER],
      participants: [person('a')],
      checkIns: [doorScan('a'), mealScan('lunch', 'a', '12:10')],
      now: at('18:30'),
    });

    expect(report.currentMeal).toBeNull();
    expect(report.countedMealCount).toBe(1);
  });

  test('nothing is current after the event ends', () => {
    const report = source({
      meals: [DINNER],
      participants: [person('a'), person('b')],
      checkIns: [
        doorScan('a'),
        doorScan('b'),
        mealScan('dinner', 'a', '18:10'),
      ],
      now: at('23:30'),
    });

    expect(report.currentMeal).toBeNull();
    expect(report.rows[1].missedStreak).toBe(1);
    expect(report.rows[1].notAtCurrentMeal).toBe(false);
  });

  test('late arrivals skip meals before they got here', () => {
    const report = source({
      meals: [BREAKFAST, LUNCH, DINNER],
      participants: [person('a'), person('b')],
      checkIns: [
        doorScan('a'),
        doorScan('b', '16:00'),
        mealScan('breakfast', 'a', '08:10'),
        mealScan('lunch', 'a', '12:10'),
        mealScan('dinner', 'a', '18:10'),
      ],
      now: at('21:00'),
    });

    expect(report.currentMeal?.id).toBe('dinner');
    expect(report.rows[1].missedStreak).toBe(0);
  });

  test('streak stops at the last meal they ate', () => {
    const report = source({
      meals: [BREAKFAST, LUNCH, DINNER],
      participants: [person('a'), person('b')],
      checkIns: [
        doorScan('a'),
        doorScan('b'),
        mealScan('breakfast', 'a', '08:10'),
        mealScan('breakfast', 'b', '08:20'),
        mealScan('lunch', 'a', '12:10'),
        mealScan('dinner', 'a', '18:10'),
      ],
      now: at('21:00'),
    });

    const b = report.rows[1];
    expect(b.missedStreak).toBe(1);
    expect(b.missedMeals.map((meal) => meal.name)).toEqual(['Lunch']);
  });

  test('no door check-in means no streak', () => {
    const report = source({
      meals: [BREAKFAST, LUNCH],
      participants: [person('a'), person('b')],
      checkIns: [doorScan('a'), mealScan('breakfast', 'a', '08:10')],
      now: at('21:00'),
    });

    const b = report.rows[1];
    expect(b.atDoor).toBe(false);
    expect(b.missedStreak).toBe(0);
    expect(b.notAtCurrentMeal).toBe(false);
  });

  test('future meals do not count', () => {
    const report = source({
      meals: [DINNER],
      participants: [person('a')],
      checkIns: [doorScan('a')],
      now: at('12:00'),
    });

    expect(report.hasMeals).toBe(true);
    expect(report.countedMealCount).toBe(0);
    expect(report.currentMeal).toBeNull();
  });
});

describe('summarizeDietaryReport', () => {
  const report = source({
    meals: [BREAKFAST, LUNCH, DINNER],
    participants: [
      person('a', ['Vegan', 'Gluten-free']),
      person('b', ['Vegan']),
      person('c'),
      person('d', ['Halal']),
    ],
    checkIns: [
      doorScan('a'),
      doorScan('b'),
      doorScan('d'),
      mealScan('breakfast', 'a', '08:10'),
      mealScan('lunch', 'a', '12:10'),
      mealScan('dinner', 'a', '18:10'),
    ],
    now: at('21:00'),
  });

  const rowFor = (label: string, threshold = 2) =>
    summarizeDietaryReport(report.rows, threshold).find(
      (row) => row.label === label,
    )!;

  test('counts someone in each restriction they have', () => {
    expect(rowFor('Vegan').expected).toBe(2);
    expect(rowFor('Gluten-free').expected).toBe(1);
    expect(rowFor('Halal').expected).toBe(1);
    expect(rowFor('Kosher').expected).toBe(0);
    expect(rowFor(NO_RESTRICTIONS_LABEL).expected).toBe(1);
  });

  test('total is people, not the sum of the rows', () => {
    const total = rowFor(TOTAL_LABEL);
    expect(total.expected).toBe(4);
    expect(total.atDoor).toBe(3);
    expect(total.notAtDoor).toBe(1);
  });

  test('missed follows the threshold', () => {
    expect(report.countedMealCount).toBe(2);
    expect(rowFor(TOTAL_LABEL, 1).missed).toBe(2);
    expect(rowFor(TOTAL_LABEL, 2).missed).toBe(2);
    expect(rowFor(TOTAL_LABEL, 3).missed).toBe(0);
    expect(rowFor(NO_RESTRICTIONS_LABEL, 1).missed).toBe(0);
  });

  test('expected never shrinks', () => {
    for (const threshold of [1, 2, 3, 4, 5]) {
      expect(rowFor(TOTAL_LABEL, threshold).expected).toBe(4);
    }
  });
});
