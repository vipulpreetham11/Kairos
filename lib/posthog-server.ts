import { PostHog } from 'posthog-node';

let posthog: PostHog | null = null;

export function getPostHogClient(): PostHog {
  if (!posthog) {
    posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY || '', {
      host: 'https://us.i.posthog.com',
      flushInterval: 5000,
    });
  }
  return posthog;
}

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, any>
): Promise<void> {
  const client = getPostHogClient();
  client.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function identifyUser(
  distinctId: string,
  properties?: Record<string, any>
): Promise<void> {
  const client = getPostHogClient();
  client.identify({
    distinctId,
    properties,
  });
}

export async function flushPostHog(): Promise<void> {
  if (posthog) {
    await posthog.flush();
  }
}
