/**
 * Everything a participant is told about their team's project, per stage.
 * The event page's project card, the project page and the editor all read
 * from here, so each stage is worded once instead of re-derived by nested
 * conditionals at every call site.
 */

import type { SubmissionWindow } from '@/lib/submissions';

/**
 * Where the caller's team's project stands: the window crossed with whether
 * the team has a project, and whether it's public.
 */
export type ProjectStage =
  | 'not_open'
  | 'not_started'
  | 'private'
  | 'public'
  | 'closed_missing'
  | 'closed_private'
  | 'closed_public';

export function getProjectStage(
  submissionWindow: Exclude<SubmissionWindow, 'disabled'>,
  submission: { published: boolean } | null,
): ProjectStage {
  switch (submissionWindow) {
    case 'not_open':
      return 'not_open';
    case 'open':
      if (!submission) return 'not_started';
      return submission.published ? 'public' : 'private';
    case 'closed':
      if (!submission) return 'closed_missing';
      return submission.published ? 'closed_public' : 'closed_private';
  }
}

export type ProjectStageCopy = {
  /** Card title where the stage has no editor or project view of its own. */
  title: string;
  /** One-line status. When `date` is set, that instant follows it. */
  description: string;
  date: 'opensAt' | 'closesAt' | null;
  /** The event page's link to the project page; null when there's nothing to open. */
  action: string | null;
  /** Shown as a warning: as things stand, the project won't be judged. */
  warning: string | null;
};

export const PROJECT_STAGE_COPY: Record<ProjectStage, ProjectStageCopy> = {
  not_open: {
    title: "Submissions aren't open yet",
    description: 'Submissions open',
    date: 'opensAt',
    action: null,
    warning: null,
  },
  not_started: {
    title: 'Start your project',
    description:
      'One write-up per team, shared by every teammate. Submissions close',
    date: 'closesAt',
    action: 'Start project',
    warning: null,
  },
  private: {
    title: 'Your project',
    description: 'Submissions close',
    date: 'closesAt',
    action: 'Edit project',
    warning:
      "Private projects won't be judged. Make it public before submissions close — you can keep editing it until then.",
  },
  public: {
    title: 'Your project',
    description: 'Submissions close',
    date: 'closesAt',
    action: 'Edit project',
    warning: null,
  },
  closed_missing: {
    title: 'Submissions are closed',
    description: "Your team didn't submit a project before the deadline.",
    date: null,
    action: null,
    warning: null,
  },
  closed_private: {
    title: 'Submissions are closed',
    description: 'Submissions are closed. Your project is final.',
    date: null,
    action: 'View project',
    warning: "It was still private at the deadline, so it won't be judged.",
  },
  closed_public: {
    title: 'Submissions are closed',
    description: 'Submissions are closed. Your project is final.',
    date: null,
    action: 'View project',
    warning: null,
  },
};

/** The public/private pill and the toasts that confirm flipping it. */
export const PROJECT_VISIBILITY_COPY = {
  public: {
    label: 'Public',
    toggleHint: 'Make private',
    madeToast: 'Project is now public',
  },
  private: {
    label: 'Private',
    toggleHint: 'Make public',
    madeToast: 'Project is now private',
  },
} as const;
