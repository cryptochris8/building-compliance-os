import { db } from '@/lib/db';
import { organizations, users } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { inngest } from './client';
import {
  checkUpcomingDeadlines,
  generateReminderEmail,
  shouldSendReminderToday,
} from '@/lib/notifications/deadline-reminders';

/**
 * Daily cron: finds upcoming deadlines (≤30 days out or up to 7 days overdue)
 * and emails owner/admin users on milestone days. Gated by REMINDER_MILESTONE_DAYS
 * so a daily cron doesn't spam recipients.
 */
export const deadlineRemindersCron = inngest.createFunction(
  { id: 'deadline-reminders-cron' },
  { cron: '0 9 * * *' },
  async ({ logger }) => {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('[deadline-reminders] RESEND_API_KEY not set — skipping email send');
      return { skipped: true, reason: 'no-resend-key' };
    }

    const orgs = await db.select({ id: organizations.id }).from(organizations);

    let processedOrgs = 0;
    let emailsSent = 0;
    let emailFailures = 0;

    for (const org of orgs) {
      processedOrgs += 1;
      try {
        const reminders = await checkUpcomingDeadlines(org.id);
        const dueToday = reminders.filter((r) => shouldSendReminderToday(r.daysUntilDeadline));
        if (dueToday.length === 0) continue;

        const recipients = await db
          .select({ email: users.email })
          .from(users)
          .where(
            and(eq(users.organizationId, org.id), inArray(users.role, ['owner', 'admin'])),
          );

        if (recipients.length === 0) continue;

        for (const reminder of dueToday) {
          for (const recipient of recipients) {
            try {
              await generateReminderEmail(reminder, recipient.email);
              emailsSent += 1;
            } catch (err) {
              emailFailures += 1;
              logger.error(
                '[deadline-reminders] failed to send',
                {
                  orgId: org.id,
                  buildingId: reminder.buildingId,
                  to: recipient.email,
                  error: err instanceof Error ? err.message : String(err),
                },
              );
            }
          }
        }
      } catch (err) {
        logger.error('[deadline-reminders] failed to process org', {
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { processedOrgs, emailsSent, emailFailures };
  },
);
