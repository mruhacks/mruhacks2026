import { getUser } from "@/utils/auth";
import QRCode from "./qrcode";
import { headers } from "next/headers";
import { Suspense } from "react";

export default async function UserQrCode() {
  const host = (await headers()).get("host")!;
  const user = await getUser();

  if (!user) throw new Error("No User Logged In");

  const userUrl = new URL(host, `/u/${encodeURIComponent(user.id)}`);

  return <QRCode data={userUrl.toString()} />;
}
