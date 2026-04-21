import { describe, it, expect, beforeEach } from 'vitest';
import { getToken, setToken } from '../lib/api';

describe('api token management', () => {
  beforeEach(() => setToken(null));

  it('starts with no token', () => {
    expect(getToken()).toBeNull();
  });

  it('stores and retrieves a token', () => {
    setToken('test-jwt-token');
    expect(getToken()).toBe('test-jwt-token');
  });

  it('clears token when set to null', () => {
    setToken('test-jwt-token');
    setToken(null);
    expect(getToken()).toBeNull();
  });
});
