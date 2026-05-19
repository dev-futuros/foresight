import { describe, it, expect } from 'vitest';
import { extractApiErrorMessage } from '../lib/apiError';

describe('extractApiErrorMessage', () => {
  it('returns the fallback for null / undefined', () => {
    expect(extractApiErrorMessage(null, 'fallback')).toBe('fallback');
    expect(extractApiErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('returns the fallback for non-Error primitives', () => {
    // Strings aren't objects in the typeof sense the code branches on.
    expect(extractApiErrorMessage('oh no', 'fallback')).toBe('fallback');
    expect(extractApiErrorMessage(42, 'fallback')).toBe('fallback');
  });

  it('joins fieldErrors when present (taking precedence over message)', () => {
    const err = {
      response: {
        data: {
          message: 'should not surface',
          fieldErrors: [
            { field: 'name', message: 'name is required' },
            { field: 'sector', message: 'sector is required' },
          ],
        },
      },
    };
    expect(extractApiErrorMessage(err, 'fallback')).toBe(
      'name is required · sector is required',
    );
  });

  it('skips empty fieldErrors and falls back to message', () => {
    const err = {
      response: {
        data: { message: 'server says no', fieldErrors: [] },
      },
    };
    expect(extractApiErrorMessage(err, 'fallback')).toBe('server says no');
  });

  it("surfaces a plain Error's message", () => {
    expect(extractApiErrorMessage(new Error('network down'), 'fallback')).toBe('network down');
  });

  it('falls back when Error.message is empty', () => {
    expect(extractApiErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });

  it('falls back when the axios envelope has neither message nor fieldErrors', () => {
    const err = { response: { data: {} } };
    expect(extractApiErrorMessage(err, 'fallback')).toBe('fallback');
  });

  it('falls back when response.data is missing entirely', () => {
    expect(extractApiErrorMessage({ response: {} }, 'fallback')).toBe('fallback');
    expect(extractApiErrorMessage({}, 'fallback')).toBe('fallback');
  });

  it('prefers axios shape over Error.message when both are present', () => {
    // An axios error is technically also an Error instance. The function
    // should use the server-supplied message rather than the generic
    // "Request failed with status code 400" axios writes into .message.
    const axiosish = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { message: 'specific reason' } },
    });
    expect(extractApiErrorMessage(axiosish, 'fallback')).toBe('specific reason');
  });
});
