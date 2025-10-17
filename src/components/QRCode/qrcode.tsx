import { cacheLife } from "next/cache";
import Image from "next/image";
import QR from "qrcode";

export type QRCodeProps = {
  data: string;
};

const WIDTH = 300;

async function generateQr(text: string) {
  return await QR.toDataURL(text, { width: WIDTH });
}

export default async function QRCode({ data }: QRCodeProps) {
  "use cache";
  cacheLife("max");
  const qr = await generateQr(data);

  return (
    <Image
      src={qr}
      width={WIDTH}
      height={WIDTH}
      loading="lazy"
      alt={`QR code for ${data}`}
    />
  );
}
