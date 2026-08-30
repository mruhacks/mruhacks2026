/**
 * Declares the `@modal` parallel slot alongside the normal page content so
 * `@modal/(.)ticket` can intercept navigation to `./ticket` and render it as
 * an overlay, while a direct visit/refresh still hits the real full page.
 */
export default function EventEntryLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
