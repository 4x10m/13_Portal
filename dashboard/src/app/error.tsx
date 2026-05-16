"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <h2 className="text-lg font-bold text-ax-red">Erreur de rendu</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">{error.message}</p>
      <button onClick={reset} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/80">
        Réessayer
      </button>
    </div>
  );
}
