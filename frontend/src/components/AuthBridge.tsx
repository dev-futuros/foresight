import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { setTokenGetter } from '../lib/api';

/**
 * Connects Clerk's session token to the standalone axios instance used across the app.
 *
 * Mounted once inside `<ClerkProvider>`, this component grabs the `getToken` function from
 * Clerk's `useAuth()` hook and hands it to the axios request interceptor. Every API call
 * from then on injects a fresh, automatically-refreshed Clerk session JWT in the
 * `Authorization` header.
 *
 * Renders nothing — its only purpose is the side effect.
 */
export default function AuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);
  return null;
}
