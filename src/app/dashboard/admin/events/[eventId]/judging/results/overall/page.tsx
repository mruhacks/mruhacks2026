import { OverallTable } from '../_components/overall-table';

/**
 * The layout already gates on results-or-award access, and what an
 * award-only viewer gets here is decided by `getJudgingResults`.
 */
export default function OverallResultsPage() {
  return <OverallTable />;
}
