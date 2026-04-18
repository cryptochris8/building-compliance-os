// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BillingCard } from '../billing-card';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const defaultProps = {
  currentTier: 'free',
  planName: 'Free',
  status: 'active',
  trialEnd: null,
  buildingCount: 1,
  buildingLimit: 1,
};

describe('BillingCard', () => {
  it('renders the current plan name and status', () => {
    render(<BillingCard {...defaultProps} />);
    // "Free" appears in both the current plan header and the pricing table
    expect(screen.getAllByText('Free').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('shows building usage', () => {
    render(<BillingCard {...defaultProps} buildingCount={3} buildingLimit={10} />);
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('displays trial badge and days remaining when trialing', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <BillingCard
        {...defaultProps}
        currentTier="pro"
        planName="Pro"
        status="trialing"
        trialEnd={futureDate}
      />
    );
    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText(/days? remaining/)).toBeInTheDocument();
  });

  it('does not show trial info when not trialing', () => {
    render(<BillingCard {...defaultProps} />);
    expect(screen.queryByText(/days? remaining/)).not.toBeInTheDocument();
  });

  it('shows destructive badge for past_due status', () => {
    render(<BillingCard {...defaultProps} status="past_due" />);
    const badge = screen.getByText('past_due');
    expect(badge).toHaveAttribute('data-variant', 'destructive');
  });

  it('renders all three pricing tiers', () => {
    render(<BillingCard {...defaultProps} />);
    expect(screen.getByText('$149')).toBeInTheDocument();
    expect(screen.getByText('$499')).toBeInTheDocument();
  });

  it('marks the current tier with "Current" badge', () => {
    render(<BillingCard {...defaultProps} currentTier="pro" planName="Pro" />);
    const currentBadges = screen.getAllByText('Current');
    expect(currentBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Manage Billing button for paid tiers', () => {
    render(<BillingCard {...defaultProps} currentTier="pro" planName="Pro" />);
    expect(screen.getByText('Manage Billing')).toBeInTheDocument();
  });

  it('hides Manage Billing button for free tier', () => {
    render(<BillingCard {...defaultProps} />);
    expect(screen.queryByText('Manage Billing')).not.toBeInTheDocument();
  });

  it('shows upgrade buttons for non-current tiers', () => {
    render(<BillingCard {...defaultProps} />);
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Portfolio')).toBeInTheDocument();
  });
});
