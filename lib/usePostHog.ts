'use client';

import { usePostHog } from 'posthog-js/react';

export function useTrackEvent() {
  const posthog = usePostHog();

  const trackEvent = (eventName: string, properties?: Record<string, any>) => {
    if (posthog) {
      posthog.capture(eventName, properties);
    }
  };

  const identifyUser = (userId: string, properties?: Record<string, any>) => {
    if (posthog) {
      posthog.identify(userId, properties);
    }
  };

  const setUserProperties = (properties: Record<string, any>) => {
    if (posthog) {
      posthog.setPersonProperties(properties);
    }
  };

  return { trackEvent, identifyUser, setUserProperties };
}
