import { describe, expect, test } from 'vitest';

import { canSubmitProject } from '@/lib/participation/status';
import {
  getSubmissionWindow,
  isPastSubmissionDeadline,
  isSubmissionsEnabled,
  submissionLinkError,
} from '@/lib/submissions';
import { submissionsCloseAtError } from '@/app/dashboard/admin/events/schemas';
import {
  publishSubmissionSchema,
  saveSubmissionSchema,
} from '@/app/dashboard/events/submission-schemas';

const START = new Date('2026-10-17T15:00:00Z');
const CLOSE = new Date('2026-10-18T18:00:00Z');
const END = new Date('2026-10-18T22:00:00Z');

const configured = {
  hasApplication: true,
  teamsEnabled: true,
  startsAt: START,
  endsAt: END,
  submissionsCloseAt: CLOSE,
};

describe('canSubmitProject', () => {
  test('with check-in enabled, only a checked-in participant qualifies', () => {
    const event = { checkInEnabled: true, hasSentRsvpWave: true };
    expect(canSubmitProject(event, 'accepted', false)).toBe(false);
    expect(canSubmitProject(event, 'accepted', true)).toBe(true);
  });

  test('without check-in, once a wave has gone out, only accepted qualifies', () => {
    const event = { checkInEnabled: false, hasSentRsvpWave: true };
    expect(canSubmitProject(event, 'accepted', false)).toBe(true);
    expect(canSubmitProject(event, 'invited', false)).toBe(false);
    expect(canSubmitProject(event, 'waitlisted', false)).toBe(false);
  });

  test('without check-in or waves, anyone able to form a team qualifies', () => {
    const event = { checkInEnabled: false, hasSentRsvpWave: false };
    expect(canSubmitProject(event, 'pending_review', false)).toBe(true);
    expect(canSubmitProject(event, 'waitlisted', false)).toBe(true);
    expect(canSubmitProject(event, 'denied', false)).toBe(false);
    expect(canSubmitProject(event, 'declined', false)).toBe(false);
  });
});

describe('submissionLinkError', () => {
  test('accepts known repo hosts, including subdomains', () => {
    expect(submissionLinkError('repo', 'https://github.com/a/b')).toBeNull();
    expect(
      submissionLinkError('repo', 'https://www.gitlab.com/a/b'),
    ).toBeNull();
    expect(
      submissionLinkError('repo', 'https://huggingface.co/spaces/a/b'),
    ).toBeNull();
  });

  test('rejects other repo hosts and look-alikes', () => {
    expect(submissionLinkError('repo', 'https://example.com/a')).toMatch(
      /github\.com/,
    );
    expect(
      submissionLinkError('repo', 'https://evilgithub.com/a'),
    ).not.toBeNull();
    expect(
      submissionLinkError('repo', 'https://github.com.evil.dev/a'),
    ).not.toBeNull();
  });

  test('only accepts known video hosts', () => {
    expect(submissionLinkError('video', 'https://youtu.be/abc')).toBeNull();
    expect(
      submissionLinkError('video', 'https://www.loom.com/share/x'),
    ).toBeNull();
    expect(submissionLinkError('video', 'https://github.com/a')).not.toBeNull();
  });

  test('demo links may be on any host, but must be https', () => {
    expect(submissionLinkError('demo', 'https://my-app.vercel.app')).toBeNull();
    expect(submissionLinkError('demo', 'http://my-app.vercel.app')).toMatch(
      /https/,
    );
    expect(submissionLinkError('demo', 'javascript:alert(1)')).not.toBeNull();
    expect(submissionLinkError('demo', 'not a url')).not.toBeNull();
  });
});

describe('isSubmissionsEnabled / getSubmissionWindow', () => {
  test('needs every prerequisite, with the deadline strictly inside the event', () => {
    expect(isSubmissionsEnabled(configured)).toBe(true);
    expect(isSubmissionsEnabled({ ...configured, hasApplication: false })).toBe(
      false,
    );
    expect(isSubmissionsEnabled({ ...configured, teamsEnabled: false })).toBe(
      false,
    );
    expect(
      isSubmissionsEnabled({ ...configured, submissionsCloseAt: null }),
    ).toBe(false);
    expect(
      isSubmissionsEnabled({ ...configured, submissionsCloseAt: END }),
    ).toBe(false);
    expect(
      isSubmissionsEnabled({ ...configured, submissionsCloseAt: START }),
    ).toBe(false);
  });

  test('opens at the start and freezes at the deadline', () => {
    const before = new Date(START.getTime() - 1);
    const during = new Date(START.getTime() + 1);
    expect(getSubmissionWindow(configured, before)).toBe('not_open');
    expect(getSubmissionWindow(configured, START)).toBe('open');
    expect(getSubmissionWindow(configured, during)).toBe('open');
    expect(getSubmissionWindow(configured, CLOSE)).toBe('closed');
    expect(
      getSubmissionWindow({ ...configured, teamsEnabled: false }, during),
    ).toBe('disabled');
  });

  test('moving the deadline later reopens the window', () => {
    const now = new Date(CLOSE.getTime() + 60_000);
    expect(getSubmissionWindow(configured, now)).toBe('closed');
    expect(
      getSubmissionWindow(
        { ...configured, submissionsCloseAt: new Date(END.getTime() - 1) },
        now,
      ),
    ).toBe('open');
  });

  test('isPastSubmissionDeadline only needs a deadline', () => {
    expect(isPastSubmissionDeadline(null)).toBe(false);
    expect(isPastSubmissionDeadline(CLOSE, new Date(CLOSE.getTime() - 1))).toBe(
      false,
    );
    expect(isPastSubmissionDeadline(CLOSE, CLOSE)).toBe(true);
  });
});

describe('submissionsCloseAtError', () => {
  test('null deadline is always fine', () => {
    expect(
      submissionsCloseAtError({
        startsAt: null,
        endsAt: null,
        submissionsCloseAt: null,
      }),
    ).toBeNull();
  });

  test('requires a start and end, and a deadline strictly between them', () => {
    expect(
      submissionsCloseAtError({
        startsAt: null,
        endsAt: END,
        submissionsCloseAt: CLOSE,
      }),
    ).toMatch(/start and end/);
    expect(
      submissionsCloseAtError({
        startsAt: START,
        endsAt: END,
        submissionsCloseAt: END,
      }),
    ).toMatch(/before it ends/);
    expect(
      submissionsCloseAtError({
        startsAt: START,
        endsAt: END,
        submissionsCloseAt: CLOSE,
      }),
    ).toBeNull();
  });
});

describe('saveSubmissionSchema', () => {
  const base = {
    title: 'Hello',
    markdown: '',
    coverImageUrl: null,
    repoUrl: '',
    demoUrl: '',
    videoUrl: '',
    expectedUpdatedAt: START.toISOString(),
  };

  test('blank links normalize to null', () => {
    const parsed = saveSubmissionSchema.parse(base);
    expect(parsed.repoUrl).toBeNull();
    expect(parsed.force).toBe(false);
  });

  test('enforces title and markdown limits', () => {
    expect(
      saveSubmissionSchema.safeParse({ ...base, title: ' ' }).success,
    ).toBe(false);
    expect(
      saveSubmissionSchema.safeParse({ ...base, title: 'x'.repeat(101) })
        .success,
    ).toBe(false);
    expect(
      saveSubmissionSchema.safeParse({ ...base, markdown: 'x'.repeat(20_001) })
        .success,
    ).toBe(false);
  });

  test('reports a bad link on its own field', () => {
    const result = saveSubmissionSchema.safeParse({
      ...base,
      videoUrl: 'https://example.com/v',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['videoUrl']);
  });
});

describe('publishSubmissionSchema', () => {
  const ready = {
    title: 'Project',
    markdown: '',
    coverImageUrl: null,
    repoUrl: 'https://github.com/team/project',
    demoUrl: null,
    videoUrl: null,
  };

  test('accepts a stored row with only a repository link', () => {
    expect(publishSubmissionSchema.safeParse(ready).success).toBe(true);
  });

  test('requires a repository link, null or blank', () => {
    for (const repoUrl of [null, '', '  ']) {
      const result = publishSubmissionSchema.safeParse({ ...ready, repoUrl });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['repoUrl']);
      expect(result.error?.issues[0]?.message).toBe(
        'Add a repository link to make your project public.',
      );
    }
  });

  test('applies the same field rules as saving', () => {
    expect(
      publishSubmissionSchema.safeParse({ ...ready, title: ' ' }).success,
    ).toBe(false);
    const result = publishSubmissionSchema.safeParse({
      ...ready,
      videoUrl: 'https://example.com/v',
    });
    expect(result.error?.issues[0]?.path).toEqual(['videoUrl']);
  });
});
