# Settings UI Visual Mockups

## Current vs. Suggested Layouts

---

## LAYOUT 1: Recommended - Bottom Sheet with Danger Zone

### Visual Structure:
```
CURRENT (All buttons visible):
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  Account                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                               ┃
┃  👤 John Doe                  ┃
┃  john@example.com             ┃
┃                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ [⏸️  PAUSE ACCOUNT]            ┃  ← Amber button
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ [🗑️  DELETE ACCOUNT]           ┃  ← Red button
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ [🚪 SIGN OUT]                  ┃  ← Gray button
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

SUGGESTED (With menu):
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  Account                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                               ┃
┃  👤 John Doe                  ┃
┃  john@example.com             ┃
┃                               ┃
┃            [⋮]                ┃  ← Tap opens menu
┃                               ┃
┃  ✓ Account: Active            ┃
┃                               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

↓ (tap ⋮)

BOTTOM SHEET OPENS:
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃        ─────               ┃  ← Handle
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                               ┃
┃  ⏸️  Pause Account            ┃  ← Amber, non-destructive
┃  ✓ Keep your data safe        ┃
┃                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                               ┃
┃  🚪 Sign Out                  ┃  ← Neutral
┃  Log out from this device     ┃
┃                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ⚠️ DANGER ZONE               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                               ┃
┃  🗑️  Delete Account           ┃  ← Red, destructive
┃  Permanent deletion           ┃
┃                               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Advantages:**
- Main screen looks clean and simple
- Menu separates concerns clearly
- "Danger Zone" heading provides strong visual warning
- Consistent with iOS/Android patterns
- Better thumb zone for bottom sheet

---

## LAYOUT 2: Collapsible Sections

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  Account                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                               ┃
┃  👤 John Doe                  ┃
┃  john@example.com             ┃
┃  ✓ Status: Active             ┃
┃                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ▼ Quick Actions              ┃
┃                               ┃
┃  [⏸️  Pause]    [🚪 Sign Out] ┃
┃                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ▶ Danger Zone                ┃  ← Collapsed
┃    (Tap to expand)            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

↓ (expand Danger Zone)

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  Account                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  👤 John Doe | john@ex.com   ┃
┃  ✓ Active                     ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ▼ Quick Actions              ┃
┃  [⏸️  Pause] [🚪 Sign Out]    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ▼ Danger Zone                ┃
┃                               ┃
┃  ⚠️  WARNING:                 ┃
┃  Permanent Deletion           ┃
┃                               ┃
┃  [🗑️  Delete Account]         ┃  ← Only visible when expanded
┃                               ┃
┃  ☐ I understand this is      ┃
┃    permanent                 ┃
┃                               ┃
┃  [Delete Permanently]         ┃
┃  (disabled until checked)    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Advantages:**
- Same screen, better organization
- Less prominent dangerous action
- Checkbox prevents accidents
- Clear visual warning with expand/collapse

---

## LAYOUT 3: Tab-Based Organization

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Account ▼              ┃
┃ ┌──────────┐ ┌──────────┐ ┃
┃ │ Active   │ │ Advanced │ ┃
┃ └──────────┘ └──────────┘ ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                               ┃
┃  👤 John Doe                  ┃
┃  john@example.com             ┃
┃                               ┃
┃  ✓ Account is active          ┃
┃  Last login: Today 2:45 PM    ┃
┃                               ┃
┃  [⏸️  Pause Account]           ┃
┃  [🚪 Sign Out]                ┃
┃                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ Advanced Tab:                 ┃
┃                               ┃
┃ 🗑️  Delete Account             ┃
┃ Permanently remove            ┃
┃                               ┃
┃ ☐ I understand all data will  ┃
┃   be deleted                  ┃
┃                               ┃
┃ [Delete Permanently]          ┃
┃ (disabled until checked)      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Advantages:**
- Logical separation of concerns
- Less overwhelming initial view
- "Advanced" tab suggests caution
- Common pattern in settings apps

---

## LAYOUT 4: Card-Based with Better Visual Hierarchy

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  Account                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                               ┃
┃  ┌─────────────────────────┐ ┃
┃  │  👤 JOHN DOE            │ ┃
┃  │  john@example.com       │ ┃
┃  │  ✓ Account: Active      │ ┃
┃  └─────────────────────────┘ ┃
┃                               ┃
┃  Primary Actions:             ┃
┃  ┌─────────────────────────┐ ┃
┃  │ [⏸️] Pause Account      │ ┃
┃  │ Keep data, disable app  │ ┃
┃  └─────────────────────────┘ ┃
┃                               ┃
┃  ┌─────────────────────────┐ ┃
┃  │ [🚪] Sign Out           │ ┃
┃  │ Log out from device     │ ┃
┃  └─────────────────────────┘ ┃
┃                               ┃
┃  Destructive Actions:         ┃
┃  ┌─────────────────────────┐ ┃
┃  │ ⚠️  DELETE ACCOUNT        │ ┃
┃  │ This cannot be undone   │ ┃
┃  │                         │ ┃
┃  │ ☐ Confirm deletion      │ ┃
┃  │                         │ ┃
┃  │ [Delete Permanently]    │ ┃
┃  └─────────────────────────┘ ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Advantages:**
- Strong visual grouping with cards
- Clear labeling of action types
- Destructive action clearly separated
- High visual hierarchy

---

## Color Scheme Recommendations

### Current Palette:
```
Pause:      Amber/Gold  (#f59e0b) → Consider: Orange (#fb923c)
Resume:     Green       (#22c55e) → Good, use brighter version
Delete:     Red         (#dc2626) → Good, already clear
Sign Out:   Gray        (#6b7280) → Consider: Blue (#3b82f6)
```

### Suggested Updates:
```
Pause:      Orange (#fb923c) - Warmer, more approachable
Resume:     Emerald (#10b981) - Brighter, more positive
Delete:     Rose (#e11d48) - Deeper red, more serious
Sign Out:   Slate (#64748b) - Neutral, not scary
Danger Zone: Scarlet (#dc2626) - Bold warning
```

---

## Typography Improvements

### Current:
- Title: Regular font weight
- Subtitle: Regular opacity

### Suggested:
```
┌─ Main Section Header ─────────────┐
│  Title (bold, 18px)               │
│  Subtitle (medium, 14px, muted)   │
│                                   │
│  [Primary Action Button]          │
│  Brief description (12px)         │
│                                   │
│  ┌─ Danger Zone ────────────────┐ │
│  │ ⚠️  WARNING               │ │
│  │                           │ │
│  │ [Destructive Action]      │ │
│  │ Very clear consequences   │ │
│  └─────────────────────────────┘ │
└────────────────────────────────────┘
```

---

## Interactive States

### Button States:
```
NORMAL:
[⏸️ Pause Account]
- Full opacity
- Normal shadow

HOVER (Web):
[⏸️ Pause Account]
- Slightly darker background
- Increased shadow

PRESSED:
[⏸️ Pause Account]
- Scaled down 0.95x
- Haptic feedback

DISABLED:
[⏸️ Pause Account]  (grayed out)
- 50% opacity
- No interaction
```

### Confirmation Modal:
```
Default:
☐ I understand data will be deleted
[Delete Permanently] (DISABLED, grayed)

After checking:
☑️ I understand data will be deleted
[Delete Permanently] (ENABLED, red)

Loading:
[⏳ Deleting...] (spinner, disabled)

Success:
✓ Account deleted
(Auto-redirect to login after 1s)
```

---

## Responsive Breakpoints

### Mobile (current focus):
- Full-width buttons
- 16px padding
- Stack vertically
- Bottom sheet for menus

### Tablet (future):
```
┌─────────────────────────────────────┐
│ Account  Account Stats              │
│                                     │
│ [User Card]     [Quick Actions]     │
│                 [Pause]  [Sign Out] │
│                                     │
│ [Danger Zone - Full Width]          │
│ [Delete Account]                    │
└─────────────────────────────────────┘
```

---

## My Top Recommendation 🎯

**Use Layout 1 (Bottom Sheet Menu) + Layout 3's collapsible concept:**

1. Keep the main account screen **clean and simple**
2. Add a **"⋮ More" menu button**
3. Bottom sheet shows:
   - Non-destructive actions (Pause, Sign Out)
   - Separated "Danger Zone" section
   - Delete with checkbox confirmation

**This gives you:**
- ✓ Clean, modern interface
- ✓ Clear action hierarchy
- ✓ Strong safety for delete
- ✓ Mobile-friendly
- ✓ Easy to implement

---

Would you like me to implement any of these designs? Just let me know which one appeals to you most!
