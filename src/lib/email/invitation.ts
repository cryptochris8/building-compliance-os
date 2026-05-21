import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromAddress = process.env.EMAIL_FROM || 'Building Compliance OS <onboarding@resend.dev>';

export interface InvitationEmailParams {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}

/**
 * Sends an organization invitation email via Resend. The acceptUrl points at
 * the /invite/[id] page where the recipient signs in (or up) and accepts.
 */
export async function sendInvitationEmail(params: InvitationEmailParams): Promise<void> {
  const { to, orgName, inviterName, role, acceptUrl, expiresAt } = params;
  const roleLabel = role === 'admin' ? 'an admin' : 'a member';
  const subject = `You've been invited to join ${orgName} on Building Compliance OS`;

  const body = [
    `${inviterName} invited you to join ${orgName} as ${roleLabel} on Building Compliance OS.`,
    '',
    `Accept the invitation: ${acceptUrl}`,
    '',
    `This invitation expires on ${expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' })}.`,
    '',
    `If you weren't expecting this invitation, you can safely ignore this email.`,
  ].join('\n');

  await resend.emails.send({
    from: fromAddress,
    to,
    subject,
    html: body.replace(/\n/g, '<br/>'),
  });
}
