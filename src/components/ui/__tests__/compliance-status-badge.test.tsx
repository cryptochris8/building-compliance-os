// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ComplianceStatusBadge, STATUS_BADGES } from '../compliance-status-badge';
import type { ComplianceStatus } from '@/types';

describe('ComplianceStatusBadge', () => {
  const statuses: ComplianceStatus[] = ['compliant', 'at_risk', 'over_limit', 'incomplete'];

  it.each(statuses)('renders the correct label for "%s" status', (status) => {
    render(<ComplianceStatusBadge status={status} />);
    expect(screen.getByText(STATUS_BADGES[status].label)).toBeInTheDocument();
  });

  it('renders as a badge element with the outline variant', () => {
    render(<ComplianceStatusBadge status="compliant" />);
    const badge = screen.getByText('Compliant');
    expect(badge).toHaveAttribute('data-variant', 'outline');
    expect(badge).toHaveAttribute('data-slot', 'badge');
  });

  it('falls back to "Incomplete" style for unknown status', () => {
    // @ts-expect-error testing unknown status
    render(<ComplianceStatusBadge status="unknown_status" />);
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
  });

  it('applies status-specific CSS classes', () => {
    render(<ComplianceStatusBadge status="at_risk" />);
    const badge = screen.getByText('At Risk');
    // The at_risk badge should have warning-related CSS variables
    expect(badge.className).toContain('warning');
  });

  it('applies font-medium class to all badges', () => {
    render(<ComplianceStatusBadge status="compliant" />);
    const badge = screen.getByText('Compliant');
    expect(badge.className).toContain('font-medium');
  });
});
