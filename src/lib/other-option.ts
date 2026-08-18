/**
 * Shared convention for "Other" options across select-style fields (profile
 * lookups like gender/university/major, and admin-defined event application
 * questions): any option whose label starts with "Other" (case-insensitive)
 * prompts a free-text "please specify" field once selected.
 */
export function isOtherOption(label: string | null | undefined): boolean {
  return Boolean(label?.trim().toLowerCase().startsWith('other'));
}

/**
 * Key used to store the free-text "please specify" answer alongside a
 * single/multi-select application question's own response, when an "Other"
 * option is selected. Lives in the same responses record as the question.
 */
export function otherTextKey(questionId: string): string {
  return `${questionId}__other`;
}
