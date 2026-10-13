import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Face scan done · Visicraft',
};

/** Where the face scan sends the person when they finish (on their phone); the Studio picks up the result by itself. */
export default function FaceScanDonePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-white">
      <div className="max-w-sm">
        <p className="text-2xl font-semibold tracking-tight">Face scan done</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">Thank you. You can close this page; the person who sent you the link will see your face as verified in a moment.</p>
      </div>
    </main>
  );
}
