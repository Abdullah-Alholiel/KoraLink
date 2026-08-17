import { ShieldAlert } from 'lucide-react';

/** Shown when a role somehow lands on a section it cannot open. */
export default function Blocked() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <ShieldAlert className="h-8 w-8 text-red-600" strokeWidth={1.5} />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-gray-900">Access restricted</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your role does not have access to this section.
      </p>
    </div>
  );
}
