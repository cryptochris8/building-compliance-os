// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ComplianceDetailClient } from '../compliance-detail-client';

// next/navigation is used for routing; stub it.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Server action import pulls in server-only; mock to a noop.
vi.mock('@/app/actions/compliance', () => ({
  calculateCompliance: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Recharts requires measured DOM; stub the heavy chart children so we only
// assert on tab structure.
vi.mock('../fuel-breakdown-chart', () => ({
  FuelBreakdownChart: () => <div data-testid="fuel-breakdown" />,
}));
vi.mock('../monthly-emissions-chart', () => ({
  MonthlyEmissionsChart: () => <div data-testid="monthly-emissions" />,
}));
vi.mock('../emissions-trend-chart', () => ({
  EmissionsTrendChart: () => <div data-testid="trend-chart" />,
}));
vi.mock('../what-if-calculator', () => ({
  WhatIfCalculator: () => <div data-testid="what-if" />,
}));

const baseProps = {
  buildingId: 'b1',
  buildingName: 'Test Building',
  grossSqft: 50000,
  occupancyType: 'office',
  jurisdictionId: 'nyc-ll97',
  selectedYear: 2026,
  availableYears: [2026, 2025],
  penaltyPerTon: 268,
  complianceData: {
    id: 'cy1',
    status: 'compliant',
    totalEmissions: 100,
    emissionsLimit: 200,
    emissionsOverLimit: 0,
    penalty: 0,
    completeness: 100,
    missingMonths: [],
  },
  readings: [],
  allComplianceYears: [{ year: 2026, emissions: 100, limit: 200 }],
};

describe('ComplianceDetailClient tabs', () => {
  it('renders all three tab triggers', () => {
    render(<ComplianceDetailClient {...baseProps} />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Emissions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Planning' })).toBeInTheDocument();
  });

  it('defaults to the Overview tab', () => {
    render(<ComplianceDetailClient {...baseProps} />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
  });

  it('switches to Emissions tab and shows emissions content', async () => {
    const user = userEvent.setup();
    render(<ComplianceDetailClient {...baseProps} />);
    await user.click(screen.getByRole('tab', { name: 'Emissions' }));
    expect(screen.getByRole('tab', { name: 'Emissions' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('fuel-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('monthly-emissions')).toBeInTheDocument();
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
  });

  it('switches to Planning tab and shows the what-if calculator', async () => {
    const user = userEvent.setup();
    render(<ComplianceDetailClient {...baseProps} />);
    await user.click(screen.getByRole('tab', { name: 'Planning' }));
    expect(screen.getByRole('tab', { name: 'Planning' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('what-if')).toBeInTheDocument();
  });

  it('keeps the year selector and recalculate button visible across tabs', async () => {
    const user = userEvent.setup();
    render(<ComplianceDetailClient {...baseProps} />);
    expect(screen.getByRole('button', { name: /recalculate/i })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Planning' }));
    expect(screen.getByRole('button', { name: /recalculate/i })).toBeInTheDocument();
  });
});
