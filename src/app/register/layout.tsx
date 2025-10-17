import { Suspense, type ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <Suspense>
        <div className="m-auto">{children}</div>
      </Suspense>
    </div>
  );
}
