import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage } from '../error';

describe('sanitizeErrorMessage', () => {
  const fallback = 'Something went wrong';

  it('returns fallback for "duplicate key" messages', () => {
    const error = new Error('duplicate key value violates unique constraint');
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('returns fallback for "violates" messages', () => {
    const error = new Error('violates foreign key constraint');
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('returns fallback for "relation" messages', () => {
    const error = new Error('relation "users" does not exist');
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('returns fallback for "column" messages', () => {
    const error = new Error('column "email" does not exist');
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('returns fallback for "ECONNREFUSED" messages', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('returns fallback for "password authentication" messages', () => {
    const error = new Error('password authentication failed for user "admin"');
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('returns fallback for "SSL" messages', () => {
    const error = new Error('SSL connection required');
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('returns fallback for "timeout" messages', () => {
    const error = new Error('connection timeout exceeded');
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('returns the message for short safe errors', () => {
    const error = new Error('Building not found');
    expect(sanitizeErrorMessage(error, fallback)).toBe('Building not found');
  });

  it('returns fallback when message exceeds 200 characters', () => {
    const longMsg = 'A'.repeat(201);
    const error = new Error(longMsg);
    expect(sanitizeErrorMessage(error, fallback)).toBe(fallback);
  });

  it('allows exactly 200 character messages', () => {
    const msg = 'B'.repeat(200);
    const error = new Error(msg);
    expect(sanitizeErrorMessage(error, fallback)).toBe(msg);
  });

  it('returns fallback for non-Error values', () => {
    expect(sanitizeErrorMessage('just a string', fallback)).toBe(fallback);
    expect(sanitizeErrorMessage(null, fallback)).toBe(fallback);
    expect(sanitizeErrorMessage(42, fallback)).toBe(fallback);
    expect(sanitizeErrorMessage(undefined, fallback)).toBe(fallback);
  });
});
