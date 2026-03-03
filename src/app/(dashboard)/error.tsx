'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || 'An unexpected error occurred. Please try again.'}
          </p>
          {error.digest && (
            <p className="mt-1 text-xs text-muted-foreground">Error ID: {error.digest}</p>
          )}
          <Button onClick={reset} className="mt-6">Try Again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
