import { describe, test, expect } from 'vitest';
import {
  buildStatusBreakdown,
  buildProfileStatsByStatus,
  buildQuestionStatsByStatus,
  type ApplicationStatsRow,
} from '@/lib/application-stats';
import type { ApplicationQuestion } from '@/types/application';
import { otherTextKey } from '@/lib/other-option';
import { participationStatusesList } from '@/types/lookups';

function q(
  overrides: Partial<ApplicationQuestion> & Pick<ApplicationQuestion, 'id' | 'type' | 'label'>,
): ApplicationQuestion {
  return { required: false, order: 0, active: true, ...overrides };
}

function row(overrides: Partial<ApplicationStatsRow> = {}): ApplicationStatsRow {
  return {
    responses: {},
    status: null,
    university: null,
    major: null,
    yearOfStudy: null,
    gender: null,
    ...overrides,
  };
}

/**
 * Question stats summed over every status, i.e. what the dashboard shows with
 * no status filter applied.
 */
function questionStats(questions: ApplicationQuestion[], rows: ApplicationStatsRow[]) {
  const sum = (counts: Record<string, number>) => Object.values(counts).reduce((total, n) => total + n, 0);
  return buildQuestionStatsByStatus(questions, rows).map((stat) => ({
    answered: sum(stat.answered),
    buckets: stat.buckets.map(({ counts, ...bucket }) => ({ ...bucket, count: sum(counts) })),
  }));
}

describe('question stats', () => {
  describe('flag filtering', () => {
    test('question with showInReports: false is excluded', () => {
      const questions = [
        q({
          id: 'q1',
          type: 'single_select',
          label: 'Q1',
          showInReports: false,
          options: [{ value: 'a', label: 'A', active: true }],
        }),
      ];
      const rows = [row({ responses: { q1: 'a' } })];
      expect(questionStats(questions, rows)).toEqual([]);
    });

    test('question with showInReports unset defaults to excluded', () => {
      const questions = [q({ id: 'q1', type: 'single_select', label: 'Q1', options: [] })];
      expect(questionStats(questions, [row()])).toEqual([]);
    });

    test('free-text question excluded even when showInReports is true', () => {
      const questions = [q({ id: 'q1', type: 'short_text', label: 'Bio', showInReports: true })];
      const rows = [row({ responses: { q1: 'hello' } })];
      expect(questionStats(questions, rows)).toEqual([]);
    });

    test('section_divider question excluded even when showInReports is true', () => {
      const questions = [
        q({
          id: 'q1',
          type: 'section_divider',
          label: 'Section',
          showInReports: true,
        }),
      ];
      expect(questionStats(questions, [row()])).toEqual([]);
    });
  });

  describe('single_select', () => {
    const options = [
      { value: 'opt-a', label: 'Option A', active: true },
      { value: 'opt-b', label: 'Option B', active: true },
      { value: 'opt-c', label: 'Option C', active: true },
      { value: 'opt-d', label: 'Option D', active: false },
    ];
    const question = q({
      id: 'q1',
      type: 'single_select',
      label: 'Favorite',
      showInReports: true,
      options,
    });

    test('maps option UUIDs to labels, retains zero-count and deactivated options, and buckets a deleted option under its raw value', () => {
      const rows = [
        row({ responses: { q1: 'opt-a' } }),
        row({ responses: { q1: 'opt-a' } }),
        row({ responses: { q1: 'opt-b' } }),
        row({ responses: { q1: 'opt-d' } }), // deactivated, still historically answered
        row({ responses: { q1: 'ghost-uuid' } }), // option no longer on the question
        row({ responses: {} }), // unanswered
      ];

      const [stats] = questionStats([question], rows);
      expect(stats.answered).toBe(5);

      const byKey = Object.fromEntries(stats.buckets.map((b) => [b.key, b]));
      expect(byKey['opt-a']).toMatchObject({ label: 'Option A', count: 2 });
      expect(byKey['opt-b']).toMatchObject({ label: 'Option B', count: 1 });
      // Zero-count option retained so the chart still shows it.
      expect(byKey['opt-c']).toMatchObject({ label: 'Option C', count: 0 });
      // Deactivated option retained and flagged.
      expect(byKey['opt-d']).toMatchObject({
        label: 'Option D',
        count: 1,
        inactive: true,
      });
      // Deleted option: never dropped, bucketed under the raw stored value.
      expect(byKey['ghost-uuid']).toMatchObject({
        label: 'ghost-uuid',
        count: 1,
      });
      expect(byKey['ghost-uuid'].inactive).toBeUndefined();
    });

    test('a null responses object is treated as no answer, not a crash', () => {
      const [stats] = questionStats([question], [row({ responses: null })]);
      expect(stats.answered).toBe(0);
    });

    test('empty rows still list every option, at zero', () => {
      const [stats] = questionStats([question], []);
      expect(stats.answered).toBe(0);
      expect(stats.buckets.map((b) => [b.key, b.count])).toEqual([
        ['opt-a', 0],
        ['opt-b', 0],
        ['opt-c', 0],
        ['opt-d', 0],
      ]);
    });
  });

  describe('multi_select', () => {
    const options = [
      { value: 'skill-js', label: 'JavaScript', active: true },
      { value: 'skill-py', label: 'Python', active: true },
      { value: 'skill-other', label: 'Other', active: true },
    ];
    const question = q({
      id: 'q2',
      type: 'multi_select',
      label: 'Skills',
      showInReports: true,
      options,
    });

    test('counts each selected element once per respondent', () => {
      const rows = [
        row({ responses: { q2: ['skill-js', 'skill-py'] } }),
        row({ responses: { q2: ['skill-js'] } }),
        row({ responses: { q2: [] } }), // no selection made -> unanswered
        row({ responses: {} }), // unanswered
      ];

      const [stats] = questionStats([question], rows);
      expect(stats.answered).toBe(2);

      const byKey = Object.fromEntries(stats.buckets.map((b) => [b.key, b]));
      expect(byKey['skill-js'].count).toBe(2);
      expect(byKey['skill-py'].count).toBe(1);
    });

    test('a malformed (non-array) answer is treated as unanswered, not a crash', () => {
      const rows = [row({ responses: { q2: 'not-an-array' } })];
      const [stats] = questionStats([question], rows);
      expect(stats.answered).toBe(0);
    });

    test('counts "Other" like any option, whether or not free text came with it', () => {
      const rows = [
        row({
          responses: { q2: ['skill-other'], [otherTextKey('q2')]: 'Rust' },
        }),
        row({ responses: { q2: ['skill-other'] } }),
        row({ responses: { q2: ['skill-js'] } }), // Other not selected here
      ];
      const [stats] = questionStats([question], rows);
      expect(stats.buckets.find((b) => b.key === 'skill-other')?.count).toBe(2);
    });
  });

  describe('boolean', () => {
    const question = q({
      id: 'q3',
      type: 'boolean',
      label: 'Attending?',
      showInReports: true,
    });

    test('counts true and false explicitly — false is not dropped for being falsy', () => {
      const rows = [
        row({ responses: { q3: true } }),
        row({ responses: { q3: false } }),
        row({ responses: { q3: false } }),
        row({ responses: {} }), // unanswered
      ];
      const [stats] = questionStats([question], rows);
      expect(stats.answered).toBe(3);

      const byKey = Object.fromEntries(stats.buckets.map((b) => [b.key, b]));
      expect(byKey['true']).toMatchObject({ label: 'Yes', count: 1 });
      expect(byKey['false']).toMatchObject({ label: 'No', count: 2 });
    });

    test('no answered rows still lists Yes and No, at zero', () => {
      const [stats] = questionStats([question], [row(), row()]);
      expect(stats.answered).toBe(0);
      expect(stats.buckets.map((b) => b.count)).toEqual([0, 0]);
    });
  });

  describe('number', () => {
    const question = q({
      id: 'q4',
      type: 'number',
      label: 'Hackathons attended',
      showInReports: true,
    });

    test('histogram buckets sum to the answered count', () => {
      const rows = [1, 2, 3, 4, 10].map((n) => row({ responses: { q4: n } }));
      const [stats] = questionStats([question], rows);
      expect(stats.answered).toBe(5);
      const bucketSum = stats.buckets.reduce((sum, b) => sum + b.count, 0);
      expect(bucketSum).toBe(5);
    });

    test('a single answered value is a single bucket', () => {
      const [stats] = questionStats([question], [row({ responses: { q4: 7 } })]);
      expect(stats.buckets).toEqual([{ key: '7', label: '7', count: 1 }]);
    });

    test('zero answered values yields no histogram buckets', () => {
      const rows = [row({ responses: {} }), row({ responses: { q4: 'not-a-number' } })];
      const [stats] = questionStats([question], rows);
      expect(stats.answered).toBe(0);
      expect(stats.buckets).toEqual([]);
    });
  });

  test('empty questions and empty rows returns an empty array', () => {
    expect(questionStats([], [])).toEqual([]);
  });
});

describe('buildStatusBreakdown', () => {
  test('seeds every known participation status at zero and counts observed statuses', () => {
    const rows = [row({ status: 'waitlisted' }), row({ status: 'waitlisted' }), row({ status: 'pending_review' })];
    const buckets = buildStatusBreakdown(rows);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

    expect(Object.keys(byKey).sort()).toEqual([...participationStatusesList].sort());
    expect(byKey['waitlisted'].count).toBe(2);
    expect(byKey['pending_review'].count).toBe(1);
    expect(byKey['denied'].count).toBe(0);
    expect(byKey['accepted'].count).toBe(0);
  });

  test('a null status is bucketed under "unknown", never dropped', () => {
    const rows = [row({ status: null }), row({ status: 'waitlisted' })];
    const buckets = buildStatusBreakdown(rows);
    const unknown = buckets.find((b) => b.key === 'unknown');
    expect(unknown?.count).toBe(1);

    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(2);
  });

  test('empty rows: every known status present at zero, no NaN', () => {
    const buckets = buildStatusBreakdown([]);
    expect(buckets).toHaveLength(participationStatusesList.length);
    buckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.percent).toBe(0);
    });
  });
});

describe('buildQuestionStatsByStatus', () => {
  test('splits select counts and respondents by status', () => {
    const questions = [
      q({
        id: 'q1',
        type: 'single_select',
        label: 'Q1',
        showInReports: true,
        options: [
          { value: 'a', label: 'A', active: true },
          { value: 'b', label: 'B', active: true },
        ],
      }),
    ];
    const rows = [
      row({ status: 'accepted', responses: { q1: 'a' } }),
      row({ status: 'accepted', responses: { q1: 'b' } }),
      row({ status: 'denied', responses: { q1: 'a' } }),
      row({ status: 'denied', responses: {} }),
    ];
    const [stat] = buildQuestionStatsByStatus(questions, rows);
    expect(stat.id).toBe('q1');
    expect(stat.answered).toEqual({ accepted: 2, denied: 1 });
    expect(stat.buckets).toEqual([
      { key: 'a', label: 'A', counts: { accepted: 1, denied: 1 } },
      { key: 'b', label: 'B', counts: { accepted: 1 } },
    ]);
  });

  test('number questions use the cohort histogram bins for every status', () => {
    const questions = [q({ id: 'n', type: 'number', label: 'N', showInReports: true })];
    const rows = [row({ status: 'accepted', responses: { n: 0 } }), row({ status: 'denied', responses: { n: 10 } })];
    const [stat] = buildQuestionStatsByStatus(questions, rows);
    expect(stat.buckets).toHaveLength(5);
    expect(stat.buckets[0].counts).toEqual({ accepted: 1 });
    expect(stat.buckets[4].counts).toEqual({ denied: 1 });
  });
});

describe('buildProfileStatsByStatus', () => {
  test('seeds canonical options and splits counts by status', () => {
    const rows = [
      row({ status: 'accepted', gender: 'Female' }),
      row({ status: 'denied', gender: 'Female' }),
      row({ status: 'denied', gender: null }),
    ];
    const gender = buildProfileStatsByStatus(rows).find((s) => s.id === 'profile:gender')!;
    expect(gender.answered).toEqual({ accepted: 1, denied: 1 });
    expect(gender.buckets.map((b) => b.label)).toContain('Male');
    expect(gender.buckets.find((b) => b.key === 'Female')!.counts).toEqual({
      accepted: 1,
      denied: 1,
    });
  });

  test('empty dietary list counts as None; missing profile is unanswered', () => {
    const rows = [
      row({ status: 'accepted', dietaryRestrictions: [] }),
      row({ status: 'accepted', dietaryRestrictions: ['Vegan', 'Halal'] }),
      row({ status: 'accepted', dietaryRestrictions: null }),
    ];
    const dietary = buildProfileStatsByStatus(rows).find((s) => s.id === 'profile:dietaryRestrictions')!;
    expect(dietary.answered).toEqual({ accepted: 2 });
    expect(dietary.buckets.find((b) => b.label === 'None')!.counts).toEqual({
      accepted: 1,
    });
    expect(dietary.buckets.find((b) => b.key === 'Vegan')!.counts).toEqual({
      accepted: 1,
    });
  });

  test('hackathon experience is a Yes/No split', () => {
    const rows = [
      row({ status: 'invited', attendedHackathonBefore: true }),
      row({ status: 'invited', attendedHackathonBefore: false }),
    ];
    const stat = buildProfileStatsByStatus(rows).find((s) => s.id === 'profile:attendedHackathonBefore')!;
    expect(stat.buckets).toEqual([
      { key: 'Yes', label: 'Yes', counts: { invited: 1 } },
      { key: 'No', label: 'No', counts: { invited: 1 } },
    ]);
  });
});
