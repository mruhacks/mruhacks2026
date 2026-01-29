import UserQrCode from "@/components/QRCode/UserQRCode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { User, Calendar } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="default" size="sm">
          <Link href="/dashboard/profile" className="inline-flex items-center gap-2">
            <User className="h-4 w-4" />
            Complete your profile
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/events" className="inline-flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Events
          </Link>
        </Button>
      </div>
      <UserQrCode />
    </div>
  );
}
