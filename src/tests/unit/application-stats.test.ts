import { describe, test, expect } from 'vitest';
import {
  buildQuestionStats,
  buildStatusBreakdown,
  buildDemographicStats,
  type ApplicationStatsRow,
} from '@/lib/application-stats';
import type { ApplicationQuestion } from '@/types/application';
import { otherTextKey } from '@/lib/other-option';

function q(
  overrides: Partial<ApplicationQuestion> &
    Pick<ApplicationQuestion, 'id' | 'type' | 'label'>,
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

describe('buildQuestionStats', () => {
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
      expect(buildQuestionStats(questions, rows)).toEqual([]);
    });

    test('question with showInReports unset defaults to excluded', () => {
      const questions = [
        q({ id: 'q1', type: 'single_select', label: 'Q1', options: [] }),
      ];
      expect(buildQuestionStats(questions, [row()])).toEqual([]);
    });

    test('free-text question excluded even when showInReports is true', () => {
      const questions = [
        q({ id: 'q1', type: 'short_text', label: 'Bio', showInReports: true }),
      ];
      const rows = [row({ responses: { q1: 'hello' } })];
      expect(buildQuestionStats(questions, rows)).toEqual([]);
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
      expect(buildQuestionStats(questions, [row()])).toEqual([]);
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

      const [stats] = buildQuestionStats([question], rows);
      expect(stats.total).toBe(6);
      expect(stats.answered).toBe(5);

      const byKey = Object.fromEntries(stats.buckets.map((b) => [b.key, b]));
      expect(byKey['opt-a']).toMatchObject({
        label: 'Option A',
        count: 2,
        percent: 40,
      });
      expect(byKey['opt-b']).toMatchObject({
        label: 'Option B',
        count: 1,
        percent: 20,
      });
      // Zero-count option retained so the chart still shows it.
      expect(byKey['opt-c']).toMatchObject({
        label: 'Option C',
        count: 0,
        percent: 0,
      });
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
      const rows = [row({ responses: null })];
      const [stats] = buildQuestionStats([question], rows);
      expect(stats.total).toBe(1);
      expect(stats.answered).toBe(0);
      stats.buckets.forEach((bucket) => expect(bucket.percent).toBe(0));
    });

    test('empty rows produce zero counts and zero percent everywhere, never NaN', () => {
      const [stats] = buildQuestionStats([question], []);
      expect(stats.total).toBe(0);
      expect(stats.answered).toBe(0);
      stats.buckets.forEach((bucket) => {
        expect(bucket.count).toBe(0);
        expect(bucket.percent).toBe(0);
        expect(Number.isNaN(bucket.percent)).toBe(false);
      });
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

    test('counts each selected element once per respondent; percentages are of respondents and can sum past 100%', () => {
      const rows = [
        row({ responses: { q2: ['skill-js', 'skill-py'] } }),
        row({ responses: { q2: ['skill-js'] } }),
        row({ responses: { q2: [] } }), // no selection made -> unanswered
        row({ responses: {} }), // unanswered
      ];

      const [stats] = buildQuestionStats([question], rows);
      expect(stats.total).toBe(4);
      expect(stats.answered).toBe(2);

      const byKey = Object.fromEntries(stats.buckets.map((b) => [b.key, b]));
      expect(byKey['skill-js']).toMatchObject({ count: 2, percent: 100 });
      expect(byKey['skill-py']).toMatchObject({ count: 1, percent: 50 });

      const totalPercent = stats.buckets.reduce((sum, b) => sum + b.percent, 0);
      expect(totalPercent).toBeGreaterThan(100);
    });

    test('a malformed (non-array) answer is treated as unanswered, not a crash', () => {
      const rows = [row({ responses: { q2: 'not-an-array' } })];
      const [stats] = buildQuestionStats([question], rows);
      expect(stats.answered).toBe(0);
    });

    test('collects "Other" free text from the sibling __other key onto the Other bucket', () => {
      const rows = [
        row({
          responses: { q2: ['skill-other'], [otherTextKey('q2')]: 'Rust' },
        }),
        row({
          responses: { q2: ['skill-other'], [otherTextKey('q2')]: 'Go' },
        }),
        row({ responses: { q2: ['skill-js'] } }), // Other not selected here
      ];
      const [stats] = buildQuestionStats([question], rows);
      const otherBucket = stats.buckets.find((b) => b.key === 'skill-other');
      expect(otherBucket?.isOther).toBe(true);
      expect(otherBucket?.otherTexts).toEqual(['Rust', 'Go']);
    });

    test('Other selected without accompanying free text does not add an empty string', () => {
      const rows = [row({ responses: { q2: ['skill-other'] } })];
      const [stats] = buildQuestionStats([question], rows);
      const otherBucket = stats.buckets.find((b) => b.key === 'skill-other');
      expect(otherBucket?.otherTexts).toBeUndefined();
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
      const [stats] = buildQuestionStats([question], rows);
      expect(stats.total).toBe(4);
      expect(stats.answered).toBe(3);

      const byKey = Object.fromEntries(stats.buckets.map((b) => [b.key, b]));
      expect(byKey['true'].label).toBe('Yes');
      expect(byKey['true'].count).toBe(1);
      expect(byKey['true'].percent).toBeCloseTo((1 / 3) * 100, 5);
      expect(byKey['false'].label).toBe('No');
      expect(byKey['false'].count).toBe(2);
      expect(byKey['false'].percent).toBeCloseTo((2 / 3) * 100, 5);
    });

    test('no answered rows yields zero percent, not NaN', () => {
      const [stats] = buildQuestionStats([question], [row(), row()]);
      expect(stats.answered).toBe(0);
      stats.buckets.forEach((bucket) => expect(bucket.percent).toBe(0));
    });
  });

  describe('number', () => {
    const question = q({
      id: 'q4',
      type: 'number',
      label: 'Hackathons attended',
      showInReports: true,
    });

    test('computes min/max/mean/median over answered values and histogram buckets sum to answered', () => {
      const rows = [1, 2, 3, 4, 10].map((n) => row({ responses: { q4: n } }));
      const [stats] = buildQuestionStats([question], rows);
      expect(stats.numeric).toEqual({ min: 1, max: 10, mean: 4, median: 3 });
      expect(stats.answered).toBe(5);
      const bucketSum = stats.buckets.reduce((sum, b) => sum + b.count, 0);
      expect(bucketSum).toBe(5);
    });

    test('an even-length answer set averages the two middle values for the median', () => {
      const rows = [1, 2, 3, 4].map((n) => row({ responses: { q4: n } }));
      const [stats] = buildQuestionStats([question], rows);
      expect(stats.numeric?.median).toBe(2.5);
    });

    test('a single answered value has no NaN and min = max = mean = median', () => {
      const rows = [row({ responses: { q4: 7 } })];
      const [stats] = buildQuestionStats([question], rows);
      expect(stats.numeric).toEqual({ min: 7, max: 7, mean: 7, median: 7 });
      expect(stats.buckets).toEqual([
        { key: '7', label: '7', count: 1, percent: 100 },
      ]);
    });

    test('zero answered values yields all-zero numeric stats, not NaN, and no histogram buckets', () => {
      const rows = [
        row({ responses: {} }),
        row({ responses: { q4: 'not-a-number' } }),
      ];
      const [stats] = buildQuestionStats([question], rows);
      expect(stats.numeric).toEqual({ min: 0, max: 0, mean: 0, median: 0 });
      expect(stats.answered).toBe(0);
      expect(stats.buckets).toEqual([]);
    });
  });

  test('empty questions and empty rows returns an empty array', () => {
    expect(buildQuestionStats([], [])).toEqual([]);
  });
});

describe('buildStatusBreakdown', () => {
  test('seeds every known application status at zero and counts observed statuses', () => {
    const rows = [
      row({ status: 'approved' }),
      row({ status: 'approved' }),
      row({ status: 'pending_review' }),
    ];
    const buckets = buildStatusBreakdown(rows);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

    expect(Object.keys(byKey).sort()).toEqual(
      ['approved', 'denied', 'pending_review', 'waitlisted'].sort(),
    );
    expect(byKey['approved'].count).toBe(2);
    expect(byKey['pending_review'].count).toBe(1);
    expect(byKey['denied'].count).toBe(0);
    expect(byKey['waitlisted'].count).toBe(0);
  });

  test('a null status is bucketed under "unknown", never dropped', () => {
    const rows = [row({ status: null }), row({ status: 'approved' })];
    const buckets = buildStatusBreakdown(rows);
    const unknown = buckets.find((b) => b.key === 'unknown');
    expect(unknown?.count).toBe(1);

    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(2);
  });

  test('empty rows: every known status present at zero, no NaN', () => {
    const buckets = buildStatusBreakdown([]);
    expect(buckets).toHaveLength(4);
    buckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.percent).toBe(0);
    });
  });
});

describe('buildDemographicStats', () => {
  test('groups each field independently and buckets a missing value under "unknown"', () => {
    const rows = [
      row({
        university: 'Mount Royal University',
        major: 'Computer Science',
        yearOfStudy: '2',
        gender: 'Woman',
      }),
      row({
        university: 'Mount Royal University',
        major: null,
        yearOfStudy: '3',
        gender: 'Man',
      }),
      row({
        university: null,
        major: 'Computer Science',
        yearOfStudy: null,
        gender: null,
      }),
    ];
    const stats = buildDemographicStats(rows);

    const uniByKey = Object.fromEntries(
      stats.university.map((b) => [b.key, b]),
    );
    expect(uniByKey['Mount Royal University'].count).toBe(2);
    expect(uniByKey['Mount Royal University'].percent).toBeCloseTo(
      (2 / 3) * 100,
      5,
    );
    expect(uniByKey['unknown']).toMatchObject({ label: 'Unknown', count: 1 });

    const majorByKey = Object.fromEntries(stats.major.map((b) => [b.key, b]));
    expect(majorByKey['Computer Science'].count).toBe(2);
    expect(majorByKey['unknown'].count).toBe(1);
  });

  test('empty rows returns no buckets for any field, no NaN', () => {
    const stats = buildDemographicStats([]);
    expect(stats.university).toEqual([]);
    expect(stats.major).toEqual([]);
    expect(stats.yearOfStudy).toEqual([]);
    expect(stats.gender).toEqual([]);
  });
});
