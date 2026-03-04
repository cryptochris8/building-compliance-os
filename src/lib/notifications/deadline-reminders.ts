import { Resend } from 'resend';
import { db } from '@/lib/db';
import { buildings, complianceYears } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getJurisdiction } from '@/lib/jurisdictions';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromAddress = process.env.EMAIL_FROM || 'Building Compliance OS <onboarding@resend.dev>';

export interface DeadlineReminder {
  buildingId: string;
  buildingName: string;
  jurisdictionId: string;
  jurisdictionName: string;
  year: number;
  reportDueDate: string;
  daysUntilDeadline: number;
  status: string;
  compliancePageUrl: string;
}

export interface ReminderEmail {
  to: string;
  subject: string;
  body: string;
}

export async function checkUpcomingDeadlines(orgId: string): Promise<DeadlineReminder[]> {
  const now = new Date();
  const reminders: DeadlineReminder[] = [];

  const orgBuildings = await db.select({
    id: buildings.id,
    name: buildings.name,
    jurisdictionId: buildings.jurisdictionId,
  }).from(buildings).where(eq(buildings.organizationId, orgId));

  for (const building of orgBuildings) {
    const cyRecords = await db.select().from(complianceYears)
      .where(eq(complianceYears.buildingId, building.id));

    for (const cy of cyRecords) {
      if (cy.reportSubmitted) continue;

      let dueDate: Date;
      if (cy.reportDueDate) {
        dueDate = new Date(cy.reportDueDate);
      } else {
        const jurisdiction = getJurisdiction(building.jurisdictionId);
        dueDate = new Date(cy.year + 1, jurisdiction.reportingDeadline.month - 1, jurisdiction.reportingDeadline.day);
      }

      const diffMs = dueDate.getTime() - now.getTime();
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysUntil <= 30) {
        const jurisdiction = getJurisdiction(building.jurisdictionId);
        reminders.push({
          buildingId: building.id,
          buildingName: building.name,
          jurisdictionId: building.jurisdictionId,
          jurisdictionName: jurisdiction.name,
          year: cy.year,
          reportDueDate: dueDate.toISOString().split('T')[0],
          daysUntilDeadline: daysUntil,
          status: cy.status || 'incomplete',
          compliancePageUrl: '/buildings/' + building.id + '/compliance?year=' + cy.year,
        });
      }
    }
  }

  return reminders.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline);
}

export async function generateReminderEmail(
  reminder: DeadlineReminder,
  recipientEmail: string
): Promise<ReminderEmail> {
  const urgency = reminder.daysUntilDeadline <= 0
    ? 'OVERDUE'
    : reminder.daysUntilDeadline <= 7
    ? 'URGENT'
    : 'REMINDER';

  const dueText = reminder.daysUntilDeadline <= 0
    ? 'was due ' + Math.abs(reminder.daysUntilDeadline) + ' days ago'
    : 'in ' + reminder.daysUntilDeadline + ' days';

  const subject = '[' + urgency + '] Compliance report for ' + reminder.buildingName + ' due ' + dueText;

  const body = [
    'Your compliance report for ' + reminder.buildingName + ' is due ' + dueText + ' on ' + reminder.reportDueDate + '.',
    '',
    'Jurisdiction: ' + reminder.jurisdictionName,
    'Compliance Year: ' + reminder.year,
    'Current Status: ' + reminder.status,
    '',
    'View compliance details: ' + reminder.compliancePageUrl,
  ].join('\n');

  await resend.emails.send({
    from: fromAddress,
    to: recipientEmail,
    subject,
    html: body.replace(/\n/g, '<br/>'),
  });

  return { to: recipientEmail, subject, body };
}
