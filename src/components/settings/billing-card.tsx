'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Check, CreditCard, Zap } from 'lucide-react';

export interface BillingCardProps {
  currentTier: string;
  planName: string;
  status: string;
  trialEnd: string | null;
  buildingCount: number;
  buildingLimit: number;
}

const TIERS = [
  {
    tier: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    features: ['1 building', 'Manual data entry', 'Basic compliance status'],
    priceIdMonthly: '',
  },
  {
    tier: 'pro',
    name: 'Pro',
    monthlyPrice: 149,
    annualMonthlyPrice: 99,
    features: [
      'Up to 10 buildings',
      'CSV upload',
      'Report generation',
      'Portfolio Manager sync',
      'Email support',
    ],
    priceIdMonthly: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID ?? 'price_pro_monthly',
  },
  {
    tier: 'portfolio',
    name: 'Portfolio',
    monthlyPrice: 499,
    annualMonthlyPrice: 399,
    features: [
      'Up to 50 buildings',
      'Everything in Pro',
      'Bulk operations',
      'Priority support',
      'Custom reports',
    ],
    priceIdMonthly: process.env.NEXT_PUBLIC_STRIPE_PORTFOLIO_MONTHLY_PRICE_ID ?? 'price_portfolio_monthly',
  },
];

export function BillingCard({
  currentTier,
  planName,
  status,
  trialEnd,
  buildingCount,
  buildingLimit,
}: BillingCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const trialDaysRemaining = trialEnd
    ? Math.max(
        0,
        Math.ceil(
          (new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  const usagePercent =
    buildingLimit > 0 ? Math.min(100, (buildingCount / buildingLimit) * 100) : 0;

  async function handleSubscribe(priceId: string) {
    setLoading(priceId);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Handle error silently
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setLoading('portal');
    try {
      const res = await fetch('/api/billing?action=portal');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Handle error silently
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Plan
          </CardTitle>
          <CardDescription>Your subscription and usage details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">{planName}</span>
            <Badge variant={status === 'active' || status === 'trialing' ? 'default' : 'destructive'}>
              {status === 'trialing' ? 'Trial' : status}
            </Badge>
          </div>

          {status === 'trialing' && trialDaysRemaining > 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 text-sm">
              <span className="font-medium">Trial:</span> {trialDaysRemaining} day
              {trialDaysRemaining !== 1 ? 's' : ''} remaining
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Buildings used</span>
              <span className="font-medium">
                {buildingCount} / {buildingLimit}
              </span>
            </div>
            <Progress value={usagePercent} />
          </div>

          {currentTier !== 'free' && (
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={loading === 'portal'}
            >
              {loading === 'portal' ? 'Loading...' : 'Manage Billing'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Pricing Table */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Plans</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isCurrent = tier.tier === currentTier;
            return (
              <Card
                key={tier.tier}
                className={isCurrent ? 'border-primary ring-1 ring-primary' : ''}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {tier.name}
                    {isCurrent && <Badge>Current</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {tier.monthlyPrice === 0 ? (
                      <span className="text-2xl font-bold">Free</span>
                    ) : (
                      <div>
                        <span className="text-2xl font-bold">
                          ${tier.monthlyPrice}
                        </span>
                        <span className="text-muted-foreground">/month</span>
                        <div className="text-xs text-muted-foreground mt-1">
                          or ${tier.annualMonthlyPrice}/mo billed annually
                        </div>
                      </div>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && tier.priceIdMonthly && (
                    <Button
                      className="w-full"
                      onClick={() => handleSubscribe(tier.priceIdMonthly)}
                      disabled={loading === tier.priceIdMonthly}
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      {loading === tier.priceIdMonthly
                        ? 'Loading...'
                        : `Upgrade to ${tier.name}`}
                    </Button>
                  )}
                  {isCurrent && (
                    <Button className="w-full" variant="outline" disabled>
                      Current Plan
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
