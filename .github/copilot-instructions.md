# Ambulance Emergency Traffic Control System

## Architecture Overview

This is a Next.js 14 application using the App Router pattern with TypeScript and Firebase Realtime Database for real-time emergency traffic control signaling.

### Key Components

- **App Router Structure**: Uses Next.js 14+ App Router (`/app` directory)
- **Client-Side Rendering**: Main page is client-rendered (`'use client'`) for real-time Firebase integration
- **Firebase Realtime Database**: Synchronizes emergency state across all connected clients
- **TypeScript**: Full type safety throughout the application

### Directory Structure

```
/app
  - layout.tsx          # Root layout with metadata
  - page.tsx            # Main emergency control interface (client component)
  - globals.css         # Global styles and animations
/lib
  - firebase.ts         # Firebase configuration and initialization
```

## Development Workflow

### Setup and Installation
```bash
npm install                    # Install dependencies
npm run dev                    # Start development server (http://localhost:3000)
npm run build                  # Production build
npm start                      # Start production server
```

### Environment Variables
- Store Firebase credentials in `.env.local` (already gitignored)
- Required variables:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_DATABASE_URL`

## Critical Conventions

### Firebase Integration
- Firebase is initialized once in `/lib/firebase.ts` with singleton pattern
- Use `getApps()` check to prevent multiple initializations
- All database operations use modular SDK (`firebase@^10.x`)
- Database path: `signal/emergency` (boolean value)

### State Management
- Use React hooks (`useState`, `useEffect`) for local state
- Firebase `onValue()` listener provides real-time updates
- Cleanup listeners in `useEffect` return function to prevent memory leaks

### Component Patterns
- **Client Components**: Mark with `'use client'` directive when using hooks or browser APIs
- **Server Components**: Default for layouts and static content
- All interactive features require client components due to Firebase real-time listeners

### Styling Approach
- CSS-in-CSS (no CSS-in-JS or Tailwind in current implementation)
- Global styles in `app/globals.css`
- CSS animations for status indicators and user feedback
- Responsive design with mobile-first breakpoints

### Safety Features
- Confirmation modal required before activating emergency mode
- Activity log tracks all emergency state changes with timestamps
- Visual feedback for all user actions (animations, status updates)
- Error handling with user-friendly alerts

## Project-Specific Patterns

### Emergency State Flow
1. User clicks "Activate Emergency" → Confirmation modal appears
2. User confirms → `handleSetEmergency(true)` called
3. Firebase `set()` updates `signal/emergency` to `true`
4. All connected clients receive update via `onValue()` listener
5. UI updates automatically (status panel, active count, activity log)

### Real-Time Synchronization
```typescript
// Firebase listener pattern used throughout
const emergencyRef = ref(database, 'signal/emergency');
onValue(emergencyRef, (snapshot) => {
  const state = snapshot.val();
  // Update local state
});
```

### Activity Logging
- Maximum 5 log entries kept in state
- New entries prepend to array with `.slice(0, 5)`
- Entries are typed with `LogEntry` interface
- Different styling for emergency vs normal logs

## Deployment Considerations

- This is a **professional medical emergency system**
- Ensure Firebase security rules restrict unauthorized access
- Consider implementing authentication for production use
- Test all emergency activations in staging before production deployment
- Monitor Firebase usage for rate limits and costs

## Common Tasks

### Adding New Features
1. Client interactivity: Add to `app/page.tsx` (remember `'use client'`)
2. Styles: Add to `app/globals.css`
3. New Firebase paths: Update in both `/lib/firebase.ts` and component logic

### Debugging
- Check browser console for Firebase connection errors
- Verify `.env.local` variables are loaded (restart dev server after changes)
- Firebase Realtime Database has emulator support for local testing

### Performance
- Firebase listeners auto-optimize for network conditions
- Next.js automatically code-splits client components
- CSS animations use GPU-accelerated transforms
