import { describe, it, expect } from 'vitest';
import { apiSuccess, apiError, ApiErrors } from '../response';

describe('API Response Helpers', () => {
  describe('apiSuccess', () => {
    it('returns standard success envelope with default 200 status', async () => {
      const response = apiSuccess({ id: '123', name: 'Test' });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        data: { id: '123', name: 'Test' },
        error: null,
      });
    });

    it('supports custom status codes', async () => {
      const response = apiSuccess({ created: true }, 201);
      expect(response.status).toBe(201);
    });

    it('handles null data', async () => {
      const response = apiSuccess(null);
      const body = await response.json();
      expect(body.data).toBeNull();
      expect(body.error).toBeNull();
    });

    it('handles array data', async () => {
      const response = apiSuccess([1, 2, 3]);
      const body = await response.json();
      expect(body.data).toEqual([1, 2, 3]);
    });
  });

  describe('apiError', () => {
    it('returns standard error envelope', async () => {
      const response = apiError('Something went wrong', 500, 'INTERNAL');
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        data: null,
        error: { message: 'Something went wrong', code: 'INTERNAL' },
      });
    });

    it('works without error code', async () => {
      const response = apiError('Bad request', 400);
      const body = await response.json();
      expect(body.error.message).toBe('Bad request');
    });
  });

  describe('ApiErrors', () => {
    it('unauthorized returns 401', async () => {
      const response = ApiErrors.unauthorized();
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('forbidden returns 403', async () => {
      const response = ApiErrors.forbidden();
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('notFound returns 404 with custom resource name', async () => {
      const response = ApiErrors.notFound('Building');
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.message).toBe('Building not found');
    });

    it('badRequest returns 400', async () => {
      const response = ApiErrors.badRequest('Invalid email');
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.message).toBe('Invalid email');
    });

    it('tooManyRequests returns 429', async () => {
      const response = ApiErrors.tooManyRequests();
      expect(response.status).toBe(429);
    });

    it('internal returns 500 with default message', async () => {
      const response = ApiErrors.internal();
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.message).toBe('Internal server error');
    });

    it('internal accepts custom message', async () => {
      const response = ApiErrors.internal('DB connection failed');
      const body = await response.json();
      expect(body.error.message).toBe('DB connection failed');
    });
  });
});
