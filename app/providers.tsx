'use client';

import PostHogClient from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { ReactNode, useEffect } from 'react';

function PostHogPageView(): null {
  useEffect(() => {
    // Track page views
    const handleRouteChange = () => {
      PostHogClient?.capture('$pageview');
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      console.log('PostHog Key:', posthogKey ? 'SET' : 'NOT SET');

      if (!posthogKey) {
        console.warn('⚠️ PostHog key is not set! Events will not be tracked.');
        return;
      }

      PostHogClient.init(posthogKey, {
        api_host: 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
      });

      console.log('✅ PostHog initialized successfully');
    }
  }, []);

  return (
    <PostHogProvider client={PostHogClient}>
      <PostHogPageView />
      {children}
    </PostHogProvider>
  );
}
