import { describe, it, expect, vi, beforeEach } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendInvitationEmail } from '../invitation';

beforeEach(() => {
  send.mockReset().mockResolvedValue({});
});

describe('sendInvitationEmail', () => {
  it('sends one email with the org name in the subject and the accept URL in the body', async () => {
    await sendInvitationEmail({
      to: 'invitee@example.com',
      orgName: 'Acme Corp',
      inviterName: 'Jane Doe',
      role: 'admin',
      acceptUrl: 'https://app.example.com/invite/abc-123',
      expiresAt: new Date('2026-05-27T00:00:00Z'),
    });

    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0] as {
      to: string; subject: string; html: string;
    };
    expect(arg.to).toBe('invitee@example.com');
    expect(arg.subject).toContain('Acme Corp');
    expect(arg.html).toContain('https://app.example.com/invite/abc-123');
    expect(arg.html).toContain('Jane Doe');
    expect(arg.html).toContain('an admin');
  });

  it('describes a member-role invitation as "a member"', async () => {
    await sendInvitationEmail({
      to: 'x@example.com',
      orgName: 'Org',
      inviterName: 'Bob',
      role: 'member',
      acceptUrl: 'https://app.example.com/invite/1',
      expiresAt: new Date('2026-06-01T00:00:00Z'),
    });

    const arg = send.mock.calls[0][0] as { html: string };
    expect(arg.html).toContain('a member');
  });
});
