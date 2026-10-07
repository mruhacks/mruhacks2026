import { isOtherOption } from '@/lib/other-option';
import type {
  ApplicationQuestion,
  ApplicationQuestionOption,
} from '@/types/application';

/**
 * One stored application answer as display text: option values become their
 * labels, an "Other" choice carries its free text, booleans read Yes/No.
 * Shared by the applications table and the swipe review card.
 */
export function getAnswerDisplayValue(
  value: unknown,
  type: ApplicationQuestion['type'],
  options: ApplicationQuestionOption[] = [],
  otherText?: unknown,
): string {
  if (value === null || value === undefined) return '—';

  const withOtherText = (label: string) =>
    isOtherOption(label) && typeof otherText === 'string' && otherText
      ? `${label} (${otherText})`
      : label;

  if (type === 'single_select') {
    const option = options.find((item) => item.value === value);
    return withOtherText(option ? option.label : String(value));
  }

  if (type === 'multi_select' && Array.isArray(value)) {
    return value
      .map((item) => {
        const option = options.find((o) => o.value === item);
        return withOtherText(option ? option.label : String(item));
      })
      .join(', ');
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}
