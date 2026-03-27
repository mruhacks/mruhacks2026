import { resolvePostAuthRedirect } from '@/utils/post-auth-redirect';

type Props = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const { next } = await searchParams;
  await resolvePostAuthRedirect({ next });
}
