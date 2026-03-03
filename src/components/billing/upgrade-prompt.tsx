'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Zap, Lock } from 'lucide-react';

export interface UpgradePromptProps {
  feature: string;
  description?: string;
  requiredTier?: string;
}

export function UpgradePrompt({
  feature,
  description,
  requiredTier = 'Pro',
}: UpgradePromptProps) {
  return (
    <Card className="border-dashed border-2 border-muted-foreground/25">
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <div className="rounded-full bg-muted p-3 mb-4">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">{feature}</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          {description ??
            `This feature is available on the ${requiredTier} plan and above. Upgrade to unlock it.`}
        </p>
        <Link href="/settings?tab=billing">
          <Button>
            <Zap className="mr-2 h-4 w-4" />
            Upgrade to {requiredTier}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
