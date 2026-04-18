import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DeadlineReminder } from '@/lib/notifications/deadline-reminders';

// Turn inngest.createFunction into an identity that returns the raw handler.
vi.mock('../client', () => ({
  inngest: {
    createFunction: (_config: unknown, _trigger: unknown, handler: unknown) => handler,
  },
}));

// DB mock — all read paths go through select().from().where() and return seeded values.
let orgRows: Array<{ id: string }> = [];
let userRows: Array<{ email: string }> = [];

// Drizzle lets the caller `await` either `from(table)` or `from(table).where(...)`.
// Model both by returning a thenable that also exposes `.where()`.
function queryResult(rows: Array<Record<string, unknown>>) {
  return {
    where: () => Promise.resolve(rows),
    then: (onFulfilled: (value: Array<Record<string, unknown>>) => unknown) =>
      Promise.resolve(rows).then(onFulfilled),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const schema = {
          organizations: { __brand: 'organizations' },
          users: { __brand: 'users' },
        } as const;
        if ((table as { __brand?: string })?.__brand === 'organizations') return queryResult(orgRows);
        if ((table as { __brand?: string })?.__brand === 'users') return queryResult(userRows);
        void schema; // keep inference happy
        return queryResult([]);
      },
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  organizations: { __brand: 'organizations' },
  users: { __brand: 'users' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

const checkUpcomingDeadlines = vi.fn();
const generateReminderEmail = vi.fn();
const shouldSendReminderToday = vi.fn();

vi.mock('@/lib/notifications/deadline-reminders', () => ({
  checkUpcomingDeadlines: (orgId: string) => checkUpcomingDeadlines(orgId),
  generateReminderEmail: (r: DeadlineReminder, email: string) => generateReminderEmail(r, email),
  shouldSendReminderToday: (days: number) => shouldSendReminderToday(days),
}));

const { deadlineRemindersCron } = await import('../deadline-reminders-cron');

type Handler = (ctx: { logger: { warn: typeof vi.fn; error: typeof vi.fn } }) => Promise<unknown>;
const handler = deadlineRemindersCron as unknown as Handler;
const logger = { warn: vi.fn(), error: vi.fn() };

function reminder(overrides: Partial<DeadlineReminder> = {}): DeadlineReminder {
  return {
    buildingId: 'b1',
    buildingName: 'Test Building',
    jurisdictionId: 'nyc-ll97',
    jurisdictionName: 'NYC LL97',
    year: 2026,
    reportDueDate: '2027-05-01',
    daysUntilDeadline: 7,
    status: 'incomplete',
    compliancePageUrl: '/buildings/b1/compliance?year=2026',
    ...overrides,
  };
}

const ORIGINAL_RESEND_KEY = process.env.RESEND_API_KEY;

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  orgRows = [];
  userRows = [];
  checkUpcomingDeadlines.mockReset();
  generateReminderEmail.mockReset().mockResolvedValue(undefined);
  shouldSendReminderToday.mockReset();
  logger.warn.mockReset();
  logger.error.mockReset();
});

afterEach(() => {
  process.env.RESEND_API_KEY = ORIGINAL_RESEND_KEY;
});

describe('deadlineRemindersCron', () => {
  it('skips when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await handler({ logger });
    expect(result).toEqual({ skipped: true, reason: 'no-resend-key' });
    expect(logger.warn).toHaveBeenCalled();
    expect(checkUpcomingDeadlines).not.toHaveBeenCalled();
  });

  it('returns zero counts when there are no orgs', async () => {
    orgRows = [];
    const result = await handler({ logger });
    expect(result).toEqual({ processedOrgs: 0, emailsSent: 0, emailFailures: 0 });
  });

  it('sends one email per milestone reminder per owner/admin recipient', async () => {
    orgRows = [{ id: 'org-1' }];
    userRows = [{ email: 'owner@test.com' }, { email: 'admin@test.com' }];
    checkUpcomingDeadlines.mockResolvedValue([reminder({ daysUntilDeadline: 7 })]);
    shouldSendReminderToday.mockReturnValue(true);

    const result = await handler({ logger });

    expect(generateReminderEmail).toHaveBeenCalledTimes(2);
    expect(generateReminderEmail).toHaveBeenCalledWith(expect.any(Object), 'owner@test.com');
    expect(generateReminderEmail).toHaveBeenCalledWith(expect.any(Object), 'admin@test.com');
    expect(result).toEqual({ processedOrgs: 1, emailsSent: 2, emailFailures: 0 });
  });

  it('does not send on non-milestone days', async () => {
    orgRows = [{ id: 'org-1' }];
    userRows = [{ email: 'owner@test.com' }];
    checkUpcomingDeadlines.mockResolvedValue([reminder({ daysUntilDeadline: 5 })]);
    shouldSendReminderToday.mockReturnValue(false);

    const result = await handler({ logger });

    expect(generateReminderEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ processedOrgs: 1, emailsSent: 0, emailFailures: 0 });
  });

  it('skips orgs with no owner/admin recipients', async () => {
    orgRows = [{ id: 'org-1' }];
    userRows = []; // no owner/admin matched
    checkUpcomingDeadlines.mockResolvedValue([reminder()]);
    shouldSendReminderToday.mockReturnValue(true);

    await handler({ logger });
    expect(generateReminderEmail).not.toHaveBeenCalled();
  });

  it('counts per-recipient send failures and keeps processing', async () => {
    orgRows = [{ id: 'org-1' }];
    userRows = [{ email: 'fail@test.com' }, { email: 'ok@test.com' }];
    checkUpcomingDeadlines.mockResolvedValue([reminder()]);
    shouldSendReminderToday.mockReturnValue(true);
    generateReminderEmail
      .mockRejectedValueOnce(new Error('resend rate limit'))
      .mockResolvedValueOnce(undefined);

    const result = await handler({ logger });

    expect(result).toEqual({ processedOrgs: 1, emailsSent: 1, emailFailures: 1 });
    expect(logger.error).toHaveBeenCalled();
  });

  it('continues to next org when one org throws during check', async () => {
    orgRows = [{ id: 'org-bad' }, { id: 'org-good' }];
    userRows = [{ email: 'owner@test.com' }];
    checkUpcomingDeadlines
      .mockRejectedValueOnce(new Error('db timeout'))
      .mockResolvedValueOnce([reminder()]);
    shouldSendReminderToday.mockReturnValue(true);

    const result = await handler({ logger });

    expect(result).toEqual({ processedOrgs: 2, emailsSent: 1, emailFailures: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to process org'),
      expect.any(Object),
    );
  });
});
