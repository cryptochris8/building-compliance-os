// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OrgMembers } from '../org-members';

// Mock server actions
vi.mock('@/app/actions/members', () => ({
  inviteMember: vi.fn(),
  cancelInvitation: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockMembers = [
  { id: 'u1', email: 'owner@test.com', fullName: 'Owner User', role: 'owner', createdAt: new Date() },
  { id: 'u2', email: 'admin@test.com', fullName: 'Admin User', role: 'admin', createdAt: new Date() },
  { id: 'u3', email: 'member@test.com', fullName: 'Regular User', role: 'member', createdAt: new Date() },
];

const mockInvitations = [
  {
    id: 'inv1',
    email: 'invited@test.com',
    role: 'member',
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  },
];

describe('OrgMembers', () => {
  it('renders all members', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={[]}
        currentUserId="u1"
        currentUserRole="owner"
      />
    );
    expect(screen.getByText('Owner User')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Regular User')).toBeInTheDocument();
  });

  it('shows "(you)" next to current user', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={[]}
        currentUserId="u1"
        currentUserRole="owner"
      />
    );
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  it('shows invite form for admins', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={[]}
        currentUserId="u2"
        currentUserRole="admin"
      />
    );
    expect(screen.getByPlaceholderText('colleague@company.com')).toBeInTheDocument();
    expect(screen.getByText('Invite')).toBeInTheDocument();
  });

  it('hides invite form for regular members', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={[]}
        currentUserId="u3"
        currentUserRole="member"
      />
    );
    expect(screen.queryByPlaceholderText('colleague@company.com')).not.toBeInTheDocument();
  });

  it('displays pending invitations for admins', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={mockInvitations}
        currentUserId="u1"
        currentUserRole="owner"
      />
    );
    expect(screen.getByText('invited@test.com')).toBeInTheDocument();
    expect(screen.getByText('Pending Invitations')).toBeInTheDocument();
  });

  it('hides pending invitations section when empty', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={[]}
        currentUserId="u1"
        currentUserRole="owner"
      />
    );
    expect(screen.queryByText('Pending Invitations')).not.toBeInTheDocument();
  });

  it('shows Remove button for non-owner members when user is admin', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={[]}
        currentUserId="u2"
        currentUserRole="admin"
      />
    );
    // Should see Remove for member (u3) but not for owner (u1) or self (u2)
    const removeButtons = screen.getAllByText('Remove');
    expect(removeButtons).toHaveLength(1);
  });

  it('does not show Remove button for regular members', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={[]}
        currentUserId="u3"
        currentUserRole="member"
      />
    );
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('shows member emails', () => {
    render(
      <OrgMembers
        members={mockMembers}
        invitations={[]}
        currentUserId="u1"
        currentUserRole="owner"
      />
    );
    expect(screen.getByText('owner@test.com')).toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    expect(screen.getByText('member@test.com')).toBeInTheDocument();
  });
});
