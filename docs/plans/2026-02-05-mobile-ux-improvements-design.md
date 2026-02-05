# Mobile UX Improvements - Design Document

**Version**: v1.27.0
**Date**: 2026-02-05
**Status**: Approved

## Overview

Improve mobile user experience with full-screen modals and enhanced navigation while keeping desktop behavior unchanged.

## Goals

1. **Logo Navigation**: Clicking OSW Studio logo on mobile navigates to dashboard
   - Non-workspace areas (dashboard, project manager): Logo → Dashboard (`/`)
   - Workspace area: Logo → Back to project manager
   - Desktop: Keep existing `onLogoClick` behavior

2. **Full-Screen Modals**: All dialogs and popovers fill screen on mobile with blur background
   - Settings, analytics, site settings, provider selection, model selection, etc.
   - Desktop: Keep existing centered dialog behavior

## Technical Approach

### Responsive Breakpoint Strategy

- **Mobile**: `< 768px` (below Tailwind `md:` breakpoint)
  - Full-screen modals
  - Logo navigates to dashboard/back

- **Desktop**: `>= 768px` (Tailwind `md:` and up)
  - Existing behavior unchanged
  - Centered dialogs with max-width
  - Logo behavior controlled by parent

### 1. Dialog Component Enhancement

**File**: `components/ui/dialog.tsx`

**Current Desktop Behavior** (keep as-is on `md:` and up):
- Centered positioning: `top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]`
- Max width: `max-w-[calc(100%-2rem)]`
- Rounded corners: `rounded-lg`
- Blur overlay: `bg-black/50 backdrop-blur-sm`

**New Mobile Behavior** (apply on `< md`):
- Full-screen positioning: `inset-0`
- Full dimensions: `h-[100dvh] w-screen` (dvh for iOS Safari compatibility)
- No rounded corners: `rounded-none`
- Same blur overlay: `bg-black/50 backdrop-blur-sm`

**Implementation**:
- Modify `DialogContent` component
- Add conditional Tailwind classes:
  ```tsx
  className={cn(
    // Mobile: full-screen
    "inset-0 h-[100dvh] w-screen rounded-none",
    // Desktop: centered dialog
    "md:top-[50%] md:left-[50%] md:translate-x-[-50%] md:translate-y-[-50%]",
    "md:max-w-lg md:rounded-lg md:w-full md:h-auto",
    // Existing classes...
  )}
  ```

### 2. Popover Component Conversion

**Affected Components**:
- `components/model-selector.tsx` - Model selection dropdown
- Provider selection (if using Popover)
- Site selector (if using Popover)
- Any other Popover-based dropdowns

**Current Desktop Behavior** (keep as-is on `md:` and up):
- Radix `Popover` component
- Dropdown positioning relative to trigger
- Auto-width based on content

**New Mobile Behavior** (apply on `< md`):
- Replace Popover with Dialog
- Full-screen takeover
- Same blur background

**Implementation approach**:
- Create viewport detection hook or use Tailwind breakpoint
- Conditional rendering:
  ```tsx
  {isMobile ? (
    <Dialog>
      <DialogTrigger>{trigger}</DialogTrigger>
      <DialogContent>{content}</DialogContent>
    </Dialog>
  ) : (
    <Popover>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent>{content}</PopoverContent>
    </Popover>
  )}
  ```

### 3. Logo Navigation Enhancement

**Files**:
- `components/ui/app-header.tsx`
- Parent components that use AppHeader

**Implementation**:
- Add viewport detection in parent components
- Pass conditional `onLogoClick` based on context:
  - **Non-workspace + Mobile**: `() => router.push('/')`
  - **Workspace + Mobile**: `() => router.back()` or navigate to project manager
  - **Desktop**: Keep existing behavior

## Version Updates

### package.json
```json
{
  "version": "1.27.0"
}
```

### CLAUDE.md - Version History
```markdown
### v1.27.0 - Mobile UX Improvements
- **Mobile Navigation**: Logo navigates to dashboard on mobile (non-workspace areas)
- **Full-Screen Modals**: All dialogs and popovers fill screen on mobile with blur background
- **Responsive Design**: Desktop behavior unchanged, mobile-first improvements
```

### What's New Entry
```markdown
## v1.27.0 - Mobile UX Improvements

### Better Mobile Experience
- **Full-Screen Dialogs**: Settings, analytics, and all modals now fill the screen on mobile devices with a beautiful blur background
- **Improved Navigation**: Tap the OSW Studio logo to quickly return to the dashboard on mobile
- **Touch-Friendly**: Larger touch targets and better thumb ergonomics for mobile users

### Technical Details
- Desktop experience unchanged - all improvements are mobile-only
- Dynamic viewport height support for iOS Safari
- Consistent full-screen experience across all dialog types
```

## Files to Modify

1. `components/ui/dialog.tsx` - Add mobile full-screen styles
2. `components/model-selector.tsx` - Convert Popover to conditional Dialog on mobile
3. Parent components using AppHeader - Add conditional logo navigation
4. `CLAUDE.md` - Add version history entry
5. `package.json` - Bump version to 1.27.0
6. What's new file (TBD - need to locate)

## Success Criteria

- [ ] All dialogs fill screen on mobile with blur background
- [ ] All popovers convert to full-screen dialogs on mobile
- [ ] Logo navigation works correctly on mobile (context-aware)
- [ ] Desktop behavior completely unchanged
- [ ] iOS Safari compatibility (dvh units)
- [ ] Smooth animations and transitions
- [ ] Version bumped to 1.27.0 with changelog entries
