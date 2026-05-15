import { redirect } from 'next/navigation';

import { getOnboardingState } from '@/utils/auth';
import { getOptions } from '@/app/dashboard/events/actions';
import OnboardingWizard from './onboarding-wizard';

export default async function OnboardingPage() {
  const state = await getOnboardingState();
  if (state.step === 'complete') redirect('/dashboard');

  const options = await getOptions();
  return <OnboardingWizard initialState={state} options={options} />;
}
