# PostHog Setup Documentation

PostHog is now configured for your Kairos app with both frontend and backend tracking enabled.

## Configuration

- **Project Token**: Stored in `NEXT_PUBLIC_POSTHOG_KEY` in `.env.local`
- **API Host**: `https://us.i.posthog.com`
- **Frontend Tracking**: Automatic page views and page leave events
- **Backend Tracking**: Available via server-side utility functions
- **Enabled in**: Production mode (can be toggled in provider configuration)

## Frontend Tracking (Client-side)

### Automatic Tracking
- Page views are automatically captured when users navigate
- Page leave events are tracked when users leave your app

### Custom Event Tracking

#### In React Components
```tsx
'use client';

import { useTrackEvent } from '@/lib/usePostHog';

export function MyComponent() {
  const { trackEvent, identifyUser, setUserProperties } = useTrackEvent();

  const handleButtonClick = () => {
    trackEvent('button_clicked', {
      button_name: 'submit',
      page: 'checkout',
    });
  };

  const handleUserLogin = (userId: string, userEmail: string) => {
    identifyUser(userId, {
      email: userEmail,
      signup_date: new Date().toISOString(),
    });
  };

  return (
    <button onClick={handleButtonClick}>
      Click Me
    </button>
  );
}
```

## Backend Tracking (Server-side)

### In Server Actions or API Routes

```ts
import { captureServerEvent, identifyUser } from '@/lib/posthog-server';

// Track an event
await captureServerEvent('user_signup', 'new_user_registered', {
  role: 'teacher',
  school_id: '123',
});

// Identify a user with properties
await identifyUser('user_id_123', {
  email: 'teacher@school.com',
  role: 'teacher',
  school_id: '123',
});
```

### In Route Handlers (API Routes)

```ts
import { captureServerEvent } from '@/lib/posthog-server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const data = await req.json();

  // Track the API call
  await captureServerEvent(data.user_id, 'api_grade_submission', {
    subject: data.subject,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
```

## Event Naming Convention

Use snake_case for event names and be descriptive:
- ✅ `button_clicked`
- ✅ `student_grade_submitted`
- ✅ `attendance_marked_bulk`
- ❌ `click`
- ❌ `submit`

## Common Events to Track

### User Actions
- `login_successful`
- `logout_initiated`
- `profile_viewed`
- `settings_changed`

### Dashboard Events
- `dashboard_accessed`
- `report_generated`
- `data_filtered`
- `export_initiated`

### Academic Events
- `grade_submitted`
- `attendance_marked`
- `exam_result_viewed`
- `assignment_submitted`

### Admin Events
- `user_created`
- `user_role_changed`
- `system_settings_updated`
- `audit_log_accessed`

## Properties to Include

Always include relevant context:
```ts
trackEvent('student_profile_viewed', {
  student_id: '123',
  viewer_role: 'teacher',
  school_id: '456',
  timestamp: new Date().toISOString(),
  duration_seconds: 45,
});
```

## Verification

PostHog events are sent asynchronously. To verify setup is working:

1. Go to your PostHog dashboard at https://posthog.com
2. Navigate to Events → Live View
3. Open your app and perform an action
4. You should see events appearing in real-time

## Environment Variables

```env
# Frontend (publicly visible, safe to expose)
NEXT_PUBLIC_POSTHOG_KEY=phc_rcMropgHZ88TU2SLPpSnjJSQYyAPC6atdR3QfA6kmhK5

# Backend (secret, not exposed to client)
NEXT_PUBLIC_POSTHOG_KEY=phc_rcMropgHZ88TU2SLPpSnjJSQYyAPC6atdR3QfA6kmhK5
```

## Best Practices

1. **Identify users early** - Call `identifyUser()` when user logs in
2. **Use consistent IDs** - Keep user ID format consistent across frontend and backend
3. **Add context** - Include user role, school ID, and other relevant data
4. **Avoid PII** - Don't track sensitive data like passwords or SSNs
5. **Batch updates** - Use PostHog's automatic flushing (5-second intervals)
6. **Test in development** - The setup is disabled in development mode

## Troubleshooting

### Events not appearing?
- Check that `NEXT_PUBLIC_POSTHOG_KEY` is set correctly
- Verify your PostHog account and project
- Check browser console for errors
- Ensure JavaScript is enabled

### Need to modify settings?
- Update `app/providers.tsx` for frontend config
- Update `lib/posthog-server.ts` for backend config

## Additional Resources

- [PostHog Documentation](https://posthog.com/docs)
- [PostHog React SDK](https://posthog.com/docs/libraries/react)
- [PostHog Node SDK](https://posthog.com/docs/libraries/node)
