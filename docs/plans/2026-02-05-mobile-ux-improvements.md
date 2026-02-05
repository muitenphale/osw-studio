# Mobile UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance mobile experience with full-screen modals and improved logo navigation while keeping desktop unchanged.

**Architecture:** Modify Dialog component to render full-screen on mobile, convert Popover components to responsive Dialog on mobile, add mobile-aware logo navigation.

**Tech Stack:** React 19, Next.js 15, Tailwind CSS v4, Radix UI Dialog/Popover, TypeScript

---

## Task 1: Update Dialog Component for Mobile Full-Screen

**Files:**
- Modify: `components/ui/dialog.tsx:49-81` (DialogContent component)

**Step 1: Modify DialogContent styling**

Update the DialogContent component to render full-screen on mobile:

```tsx
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed z-50 grid gap-4 p-6 shadow-2xl duration-200",
          // Mobile: full-screen
          "inset-0 h-[100dvh] w-screen rounded-none",
          // Desktop: centered dialog
          "md:top-[50%] md:left-[50%] md:translate-x-[-50%] md:translate-y-[-50%]",
          "md:max-w-[calc(100%-2rem)] md:rounded-lg md:w-full md:h-auto md:inset-auto",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}
```

**Step 2: Test dialog on mobile viewport**

Manual test:
1. Run `npm run dev`
2. Open browser DevTools, set viewport to iPhone 14 (390x844)
3. Open Settings modal
4. Verify: Modal fills entire screen, blur background visible, close button accessible

Expected: Full-screen modal on mobile, centered on desktop

**Step 3: Commit**

```bash
git add components/ui/dialog.tsx
git commit -m "feat(ui): add full-screen dialog support for mobile

- Mobile: dialogs fill entire viewport with dvh units for iOS
- Desktop: existing centered behavior unchanged
- Responsive classes using md: breakpoint

Part of v1.27.0 mobile UX improvements

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Mobile-Responsive Popover Wrapper

**Files:**
- Create: `components/ui/responsive-popover.tsx`

**Step 1: Create responsive popover component**

Create a new wrapper component that renders Popover on desktop, Dialog on mobile:

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ResponsivePopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function ResponsivePopover({
  trigger,
  children,
  open,
  onOpenChange,
  contentClassName,
  align = 'start',
  side = 'bottom',
}: ResponsivePopoverProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if viewport is mobile (<768px)
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className={contentClassName}>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} side={side} className={contentClassName}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
```

**Step 2: Test responsive popover**

Manual test:
1. Create test page or modify model-selector temporarily
2. Toggle viewport between mobile (390px) and desktop (1920px)
3. Verify: Popover on desktop, Dialog on mobile

Expected: Correct component rendered based on viewport

**Step 3: Commit**

```bash
git add components/ui/responsive-popover.tsx
git commit -m "feat(ui): add responsive popover component

- Renders Popover on desktop (>= 768px)
- Renders full-screen Dialog on mobile (< 768px)
- Detects viewport with resize listener
- Maintains same API as Popover

Part of v1.27.0 mobile UX improvements

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Convert Model Selector to Responsive Popover

**Files:**
- Modify: `components/model-selector.tsx:10-14,53-298`

**Step 1: Replace Popover with ResponsivePopover**

Update imports and component usage:

```tsx
// Replace this import:
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// With this:
import { ResponsivePopover } from '@/components/ui/responsive-popover';
```

Then update the component JSX (around lines 268-298):

```tsx
<ResponsivePopover
  open={open}
  onOpenChange={setOpen}
  contentClassName="w-full md:w-[32rem] p-0"
  trigger={
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn(
        "w-full justify-between gap-2",
        needsApiKey && "border-yellow-500 bg-yellow-500/10",
        className
      )}
      disabled={needsApiKey}
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Model icon and name */}
        {selectedModelObj ? (
          <>
            {/* Icon logic */}
            <span className="truncate font-medium">
              {getModelName(selectedModelObj)}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground truncate">Select model...</span>
        )}
      </div>
      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  }
>
  {/* Content: search input + model list */}
  <div className="flex flex-col max-h-[70vh] md:max-h-[400px]">
    {/* Search input */}
    <div className="p-3 border-b sticky top-0 bg-background">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6"
            onClick={() => setSearchQuery('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>

    {/* Model list - scrollable */}
    <div className="overflow-y-auto flex-1">
      {/* Existing model list rendering */}
    </div>
  </div>
</ResponsivePopover>
```

**Step 2: Test model selector on mobile**

Manual test:
1. Navigate to workspace
2. Open model selector on mobile viewport (390px)
3. Verify: Full-screen modal, search works, selection closes modal
4. Test on desktop viewport (1920px)
5. Verify: Dropdown popover, existing behavior

Expected: Responsive behavior, mobile full-screen, desktop dropdown

**Step 3: Commit**

```bash
git add components/model-selector.tsx
git commit -m "feat(model-selector): convert to responsive popover

- Mobile: full-screen dialog with search
- Desktop: existing popover dropdown unchanged
- Max height adjusted for mobile viewports

Part of v1.27.0 mobile UX improvements

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Mobile Logo Navigation - Non-Workspace Areas

**Files:**
- Modify: `app/page.tsx` (main dashboard/project manager page)

**Step 1: Find the AppHeader usage in main page**

Read `app/page.tsx` to locate AppHeader component and onLogoClick handler.

**Step 2: Add mobile-aware logo navigation**

Add viewport detection and conditional navigation:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleLogoClick = () => {
    if (isMobile) {
      router.push('/'); // Navigate to dashboard on mobile
    }
    // On desktop: do nothing or keep existing behavior
  };

  return (
    <AppHeader
      onLogoClick={handleLogoClick}
      // ... other props
    />
  );
}
```

**Step 3: Test logo navigation**

Manual test:
1. Open OSW Studio in mobile viewport
2. Click logo from project manager
3. Verify: Navigates to dashboard (or refreshes if already there)
4. Test on desktop
5. Verify: No navigation (existing behavior)

Expected: Mobile navigates to dashboard, desktop unchanged

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(navigation): add mobile logo navigation to dashboard

- Mobile: logo click navigates to dashboard
- Desktop: existing behavior unchanged
- Viewport detection with resize listener

Part of v1.27.0 mobile UX improvements

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Mobile Logo Navigation - Workspace Area

**Files:**
- Modify: `components/workspace/index.tsx:658` (onBack prop for AppHeader)

**Step 1: Add mobile-aware back navigation**

Update the workspace component to handle mobile logo clicks:

```tsx
const [isMobile, setIsMobile] = useState(false);

useEffect(() => {
  const checkMobile = () => {
    setIsMobile(window.innerWidth < 768);
  };
  checkMobile();
  window.addEventListener('resize', checkMobile);
  return () => window.removeEventListener('resize', checkMobile);
}, []);

const handleLogoClick = () => {
  if (isMobile) {
    // Navigate back to project manager on mobile
    onBack();
  } else {
    // Desktop: existing behavior (onBack or nothing)
    onBack?.();
  }
};

<AppHeader
  onLogoClick={handleLogoClick}
  // ... other props
/>
```

**Step 2: Test workspace logo navigation**

Manual test:
1. Open project in workspace on mobile viewport
2. Click logo
3. Verify: Returns to project manager
4. Test on desktop
5. Verify: Existing behavior maintained

Expected: Mobile returns to project list, desktop unchanged

**Step 3: Commit**

```bash
git add components/workspace/index.tsx
git commit -m "feat(workspace): add mobile logo back navigation

- Mobile: logo click returns to project manager
- Desktop: existing behavior unchanged
- Consistent with mobile navigation patterns

Part of v1.27.0 mobile UX improvements

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Convert Site/Template Sort Popovers (Optional Enhancement)

**Files:**
- Modify: `components/views/sites-view.tsx:15` (Popover usage)
- Modify: `components/template-manager/index.tsx:30-33` (Popover usage)

**Note**: These are lower priority. If time permits, convert to ResponsivePopover. Otherwise, can be addressed in future update.

**Step 1: Replace Popover imports**

Same pattern as model-selector:
```tsx
import { ResponsivePopover } from '@/components/ui/responsive-popover';
```

**Step 2: Update component usage**

Follow same pattern as Task 3 - extract trigger and content, wrap in ResponsivePopover.

**Step 3: Test and commit**

Same testing pattern, separate commits per component.

---

## Task 7: Update Version and Changelog

**Files:**
- Modify: `package.json:3` (version field)
- Modify: `CLAUDE.md` (version history section)
- Modify: `docs/WHATS_NEW.md` (user-facing changelog)

**Step 1: Bump version in package.json**

```json
{
  "name": "osw-studio",
  "version": "1.27.0",
  "private": true,
  ...
}
```

**Step 2: Add version history to CLAUDE.md**

Insert after v1.26.0 entry (around line 250):

```markdown
### v1.27.0 - Mobile UX Improvements
- **Mobile Navigation**: Logo navigates to dashboard on mobile (non-workspace areas)
- **Full-Screen Modals**: All dialogs and popovers fill screen on mobile with blur background
- **Responsive Design**: Desktop behavior unchanged, mobile-first improvements
```

**Step 3: Add What's New entry to docs/WHATS_NEW.md**

Insert at the top of the file:

```markdown
## v1.27.0 - Mobile UX Improvements (2026-02-05)

### Better Mobile Experience
- **Full-Screen Dialogs**: Settings, analytics, and all modals now fill the screen on mobile devices with a beautiful blur background
- **Improved Navigation**: Tap the OSW Studio logo to quickly return to the dashboard on mobile
- **Touch-Friendly**: Larger touch targets and better thumb ergonomics for mobile users
- **iOS Safari Support**: Dynamic viewport height (dvh) units for proper full-screen on iOS

### Technical Details
- Desktop experience unchanged - all improvements are mobile-only
- Responsive breakpoint at 768px (Tailwind md:)
- Consistent full-screen experience across all dialog types
```

**Step 4: Test What's New display**

Manual test:
1. Navigate to dashboard
2. Verify What's New card shows v1.27.0
3. Click to view full changelog
4. Verify formatting and content display correctly

Expected: Version appears on dashboard, changelog renders properly

**Step 5: Commit version bump**

```bash
git add package.json CLAUDE.md docs/WHATS_NEW.md
git commit -m "chore: bump version to v1.27.0

Add changelog entries for mobile UX improvements:
- Full-screen modals on mobile
- Logo navigation enhancements
- iOS Safari compatibility

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Final Testing & Verification

**Step 1: Comprehensive mobile testing**

Test all dialogs on mobile viewport (390x844):
- Settings modal (click Settings in header dropdown)
- About modal (click About in Settings)
- Site settings (if in Server Mode)
- Analytics dashboard
- Create project dialog
- Model selector
- Any other dialogs/popovers

Verify each:
- Fills entire screen
- Blur background visible
- Close button accessible
- Content scrollable if needed
- Smooth animations

**Step 2: Desktop regression testing**

Test same dialogs on desktop viewport (1920x1080):
- Verify centered positioning
- Verify max-width constraints
- Verify rounded corners
- Verify existing behavior unchanged

**Step 3: Logo navigation testing**

Mobile (390px):
- Dashboard → Logo click → Dashboard (refresh)
- Project manager → Logo click → Dashboard
- Workspace → Logo click → Project manager

Desktop (1920px):
- Verify existing behavior maintained

**Step 4: Build verification**

```bash
npm run build
```

Expected: No TypeScript errors, successful build

**Step 5: Final commit if fixes needed**

```bash
git add .
git commit -m "fix: mobile UX testing adjustments

Address edge cases found during testing

Part of v1.27.0 mobile UX improvements

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Implementation Notes

**DRY Principles:**
- Single ResponsivePopover component used across all popover conversions
- Viewport detection hook reusable pattern
- Consistent mobile breakpoint (768px)

**YAGNI:**
- No custom animations beyond Radix defaults
- No swipe gestures or advanced mobile interactions
- No bottom sheet library - use Dialog for simplicity

**Testing Strategy:**
- Manual testing with browser DevTools viewport emulation
- Focus on responsive breakpoints and visual correctness
- No automated tests needed for UI-only changes

**iOS Considerations:**
- Use `h-[100dvh]` instead of `h-screen` for proper viewport height
- Dynamic viewport units handle iOS Safari's dynamic UI chrome

**Accessibility:**
- Close button remains accessible in full-screen mode
- Focus trap maintained by Radix Dialog
- Keyboard navigation (Escape to close) works on mobile

---

## Success Criteria

- [ ] All dialogs fill screen on mobile with blur background
- [ ] Desktop dialogs unchanged (centered, max-width)
- [ ] Model selector converts to full-screen on mobile
- [ ] Logo navigates to dashboard on mobile (non-workspace)
- [ ] Logo navigates back on mobile (workspace)
- [ ] Desktop logo behavior unchanged
- [ ] iOS Safari compatibility verified
- [ ] Build completes without errors
- [ ] Version bumped to 1.27.0
- [ ] Changelog entries added

---

## Rollback Plan

If issues arise:
```bash
git reset --hard <commit-before-v1.27.0>
```

All changes are incremental commits, easy to revert individually.
