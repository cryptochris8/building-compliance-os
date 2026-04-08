import { describe, it, expect, vi } from 'vitest';

// Mock resend so emails aren't sent
vi.mock('resend', () => {
  const ResendMock = class {
    emails = { send: vi.fn().mockResolvedValue({}) };
  };
  return { Resend: ResendMock };
});

// Mock DB and schema dependencies
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  buildings: {},
  complianceYears: {},
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), inArray: vi.fn() }));
vi.mock('@/lib/jurisdictions', () => ({
  getJurisdiction: vi.fn(),
}));

import { generateReminderEmail } from '../deadline-reminders';
import type { DeadlineReminder } from '../deadline-reminders';

function makeReminder(overrides: Partial<DeadlineReminder> = {}): DeadlineReminder {
  return {
    buildingId: 'bld-1',
    buildingName: 'Test Building',
    jurisdictionId: 'nyc-ll97',
    jurisdictionName: 'NYC LL97',
    year: 2025,
    reportDueDate: '2026-05-01',
    daysUntilDeadline: 15,
    status: 'incomplete',
    compliancePageUrl: '/buildings/bld-1/compliance?year=2025',
    ...overrides,
  };
}

describe('generateReminderEmail', () => {
  it('returns OVERDUE urgency when daysUntilDeadline <= 0', async () => {
    const reminder = makeReminder({ daysUntilDeadline: -5 });
    const result = await generateReminderEmail(reminder, 'test@example.com');

    expect(result.subject).toContain('[OVERDUE]');
    expect(result.subject).toContain('Test Building');
    expect(result.subject).toContain('5 days ago');
    expect(result.to).toBe('test@example.com');
  });

  it('returns URGENT urgency when daysUntilDeadline is 1-7', async () => {
    const reminder = makeReminder({ daysUntilDeadline: 3 });
    const result = await generateReminderEmail(reminder, 'user@example.com');

    expect(result.subject).toContain('[URGENT]');
    expect(result.subject).toContain('in 3 days');
  });

  it('returns REMINDER urgency when daysUntilDeadline is 8-30', async () => {
    const reminder = makeReminder({ daysUntilDeadline: 15 });
    const result = await generateReminderEmail(reminder, 'user@example.com');

    expect(result.subject).toContain('[REMINDER]');
    expect(result.subject).toContain('in 15 days');
  });

  it('subject includes urgency and building name', async () => {
    const reminder = makeReminder({ buildingName: 'Empire State', daysUntilDeadline: 2 });
    const result = await generateReminderEmail(reminder, 'user@example.com');

    expect(result.subject).toMatch(/^\[URGENT\] Compliance report for Empire State/);
  });

  it('body includes all required fields', async () => {
    const reminder = makeReminder({
      buildingName: 'My Building',
      jurisdictionName: 'NYC LL97',
      year: 2025,
      status: 'incomplete',
      reportDueDate: '2026-05-01',
      compliancePageUrl: '/buildings/bld-1/compliance?year=2025',
      daysUntilDeadline: 10,
    });

    const result = await generateReminderEmail(reminder, 'user@example.com');

    expect(result.body).toContain('My Building');
    expect(result.body).toContain('NYC LL97');
    expect(result.body).toContain('2025');
    expect(result.body).toContain('incomplete');
    expect(result.body).toContain('2026-05-01');
    expect(result.body).toContain('/buildings/bld-1/compliance?year=2025');
  });

  it('OVERDUE body says "was due X days ago"', async () => {
    const reminder = makeReminder({ daysUntilDeadline: 0 });
    const result = await generateReminderEmail(reminder, 'test@test.com');

    expect(result.subject).toContain('[OVERDUE]');
    expect(result.body).toContain('was due 0 days ago');
  });
});
