import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <div className="m-auto">{children}</div>
    </div>
  );
}
