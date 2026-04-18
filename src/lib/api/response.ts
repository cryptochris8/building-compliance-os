import { NextResponse } from 'next/server';

/**
 * Standard API response envelope.
 * All API routes should use these helpers for consistent response shapes.
 */

export interface ApiSuccessResponse<T = unknown> {
  data: T;
  error: null;
}

export interface ApiErrorResponse {
  data: null;
  error: {
    message: string;
    code?: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Return a success response with standard envelope */
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data, error: null } satisfies ApiSuccessResponse<T>, { status });
}

/** Return an error response with standard envelope */
export function apiError(message: string, status: number, code?: string) {
  return NextResponse.json(
    { data: null, error: { message, code } } satisfies ApiErrorResponse,
    { status }
  );
}

/** Common error responses */
export const ApiErrors = {
  unauthorized: () => apiError('Unauthorized', 401, 'UNAUTHORIZED'),
  forbidden: () => apiError('Forbidden', 403, 'FORBIDDEN'),
  notFound: (resource = 'Resource') => apiError(`${resource} not found`, 404, 'NOT_FOUND'),
  badRequest: (message: string) => apiError(message, 400, 'BAD_REQUEST'),
  tooManyRequests: () => apiError('Too many requests', 429, 'RATE_LIMITED'),
  internal: (message = 'Internal server error') => apiError(message, 500, 'INTERNAL_ERROR'),
} as const;
