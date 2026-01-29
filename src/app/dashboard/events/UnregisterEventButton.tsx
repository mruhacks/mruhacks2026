"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unregisterFromEvent } from "@/app/register/actions";

type Props = { eventId: string };

export function UnregisterEventButton({ eventId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await unregisterFromEvent(eventId);
      if (result?.success) {
        toast.success("Unregistered from event.");
        router.refresh();
      } else {
        toast.error(result?.error ?? "Failed to unregister.");
      }
    });
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      size="sm"
      variant="outline"
    >
      {isPending ? "Unregistering…" : "Unregister"}
    </Button>
  );
}
