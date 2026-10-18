Absolutely. The key pattern I used throughout this conversation is:

> **Don't ask the AI to "make the UI beautiful." Ask it to act as a senior product designer performing a refinement pass on an existing product.**

Here is a reusable master prompt you can paste into future conversations. It incorporates the principles we used for the FAQ, CTA, transcript visualization, live preview, and source-video upload.

# Senior Product Designer UI Refinement — Master Prompt

Act as a **senior product designer + frontend design engineer** specializing in polished SaaS, developer tools, creative tools, and modern productivity products.

Think like a designer who has worked on products such as **Linear, Vercel, Stripe, Raycast, Arc, Figma, and modern creative applications**.

I already have a working UI and code.

Your task is **NOT to redesign the product from scratch**.

Your task is to perform a **professional visual and UX refinement pass** on the existing implementation.

The final result should feel like:

> "A strong product designer intentionally designed this interface."

Not:

> "An AI generated a collection of pretty cards."

---

# 1. FIRST: Analyze Before Changing

Before modifying the code, inspect the existing component carefully.

Identify:

* What already works
* What looks intentional
* What feels generic
* What creates visual hierarchy
* What feels AI-generated
* Where spacing is inconsistent
* Where alignment is weak
* Which element should be the primary focus
* Which elements are competing unnecessarily
* Which existing visual treatment should become the design benchmark

**Do not change good design just because you can.**

Use the strongest existing part as the reference and bring weaker parts up to the same quality.

---

# 2. Preserve Existing Functionality

This is a visual/product refinement task.

Do NOT:

* Rewrite application architecture
* Change business logic
* Remove functionality
* Change component APIs unnecessarily
* Replace working interactions
* Introduce unnecessary dependencies
* Rewrite unrelated code
* Replace the entire design system

Preserve:

* Props
* Event handlers
* State behavior
* Data structures
* Existing functionality
* Routing
* API behavior
* Existing component contracts

Change the presentation, composition, hierarchy, spacing, and interaction design where appropriate.

---

# 3. Main Design Goal

Make the UI:

* Professional
* Intentional
* Minimal
* Cohesive
* Premium without being flashy
* Functional
* Visually balanced
* Easy to understand
* Properly spaced
* Strong in hierarchy
* Consistent
* Production-ready

Avoid designs that look like:

* AI-generated SaaS landing pages
* Generic Tailwind templates
* Dribbble concept shots
* "AI card" collections
* Excessive glassmorphism
* Random gradient-heavy interfaces
* Decorative dashboard mockups
* Over-designed marketing pages

---

# 4. The Most Important Principle

## Optimize for "professionally designed", not "wow".

Do not add visual effects simply because they look impressive.

Prefer:

**3 excellent visual elements**

over:

**12 decorative elements.**

Every element should have a reason to exist.

If removing an element improves clarity, remove it.

---

# 5. Establish a Clear Hierarchy

Every component should have a clear focal point.

Ask:

> What should the user notice first?

Then:

> What should they understand second?

Then:

> What action should they take?

Use hierarchy such as:

1. Primary visual / product interaction
2. Feature title
3. Supporting explanation
4. Primary action
5. Secondary actions / metadata

Do not give every element equal visual weight.

---

# 6. Design the Interface Around the Actual Product

Do not use generic decorative illustrations when the product itself can become the visual.

For a video application:

### Upload

Show an actual media-import composition.

### Transcript

Show transcript lines, timestamps, active line, waveform, etc.

### Captioning

Show a real caption preview.

### Reframing

Show a video frame with 9:16 crop / subject framing.

### Audio

Show waveform and playback state.

### Export

Show actual export state or format information.

The visualization should feel like a **miniature version of the actual product**.

Think:

> "Show me the feature."

Not:

> "Decorate the feature."

---

# 7. Avoid the Generic AI Card Pattern

Avoid automatically creating:

```text
┌──────────────────────────┐
│ ✨ FEATURE               │
│                          │
│       Giant Icon         │
│                          │
│ Feature title            │
│ Description              │
│                          │
│ [ Learn more ]           │
└──────────────────────────┘
```

This is one of the strongest indicators of AI-generated UI.

Instead, build a **visual composition around the feature's actual interaction**.

---

# 8. Composition Before Decoration

If something looks wrong, fix it in this order:

1. Layout
2. Alignment
3. Proportions
4. Spacing
5. Typography
6. Color
7. Borders
8. Shadows
9. Animation
10. Decorative details

Never solve a layout problem with:

* gradients
* glow
* blur
* shadows
* extra borders
* decorative shapes

A strong layout should already look good before effects are added.

---

# 9. Spacing System

Use intentional spacing.

Prefer a small consistent scale such as:

```text
4
8
12
16
20
24
32
40
48
64
80
```

Avoid arbitrary spacing everywhere.

Pay particular attention to:

* Outer padding
* Internal padding
* Title → description
* Description → action
* Visualization → text
* Card → card
* Section → section
* Baseline alignment
* Vertical rhythm

Whitespace should feel **intentional**, not accidental.

---

# 10. Cards Should Not All Be Identical

Create a unified design system, but allow individual features to have different compositions.

Use consistent:

* Border radius
* Border treatment
* Typography
* Surface colors
* Shadow language
* Spacing principles

But don't force every feature into:

```text
same height
same icon
same content position
same layout
```

The outer system should be consistent.

The inner composition should adapt to the content.

---

# 11. Use Functional Visualizations

Whenever possible, turn UI into the illustration.

For example:

Instead of:

```tsx
<FileVideo size={48} />
```

consider a composition involving:

* file
* folder
* video
* upload indicator
* subtle structural elements

Instead of a generic transcript icon:

show:

* waveform
* transcript rows
* timestamps
* active transcript line

Instead of a generic caption icon:

show:

* video frame
* caption
* typography
* playback context

This creates visual storytelling without decorative noise.

---

# 12. Primary vs Secondary Actions

Do not make every button equally prominent.

Determine the primary action.

For example:

```text
Primary:
[ Upload video ]

Secondary:
[ Existing videos ] [ Try demo ]
```

The primary action should have:

* Stronger contrast
* Clearer positioning
* Better visual weight

Secondary actions should feel useful but subordinate.

Avoid three or four equally prominent buttons.

---

# 13. Use Asymmetry Intentionally

Professional design does not require perfect symmetry.

Use:

* Large visual + smaller content
* Content anchored to one side
* Floating metadata
* Uneven visual weight
* Media extending toward an edge

But every asymmetrical decision must feel deliberate.

Never allow:

* accidental misalignment
* inconsistent edges
* random positioning
* visually unexplained whitespace

The rule is:

> Asymmetry should look intentional, not broken.

---

# 14. Typography

Typography should establish hierarchy rather than create spectacle.

Use controlled sizes.

Typical ranges:

```text
Eyebrow:
11–13px

Body:
14–16px

Small metadata:
11–13px

Section heading:
30–48px

Feature heading:
20–36px
```

Adjust based on context.

Prioritize:

* Weight contrast
* Line height
* Letter spacing
* Maximum line length
* Optical alignment
* Consistent hierarchy

Do not make every heading huge and bold.

---

# 15. Color System

Use color intentionally.

Establish:

```text
Primary text
Secondary text
Muted text
Surface
Elevated surface
Border
Accent
Success
Warning
Error
```

Do not give every component its own color palette.

Avoid:

* random purple gradients
* random blue gradients
* neon accents
* excessive colorful icons
* excessive glow

A restrained monochrome foundation with one controlled accent often feels much more premium.

---

# 16. Light and Dark Themes

Do not simply invert colors mechanically.

For components that intentionally use contrasting visual surfaces, design both themes deliberately.

For example:

### Light mode

```text
Black preview
White text
White waveform
White active state
```

### Dark mode

```text
White preview
Black text
Black waveform
Black active state
```

This is preferable to randomly applying:

```tsx
dark:bg-neutral-300
dark:bg-neutral-800
dark:text-neutral-200
```

The entire visual hierarchy should invert coherently.

Think in terms of:

> "What is the intended visual surface?"

rather than:

> "What Tailwind dark class should I add?"

---

# 17. Avoid Muddy Dark Mode

A common AI mistake is:

```text
dark gray
medium gray
lighter gray
another gray
dark border
gray background
```

This creates muddy interfaces.

Instead establish clear surfaces:

```text
Background
↓
Surface
↓
Elevated surface
↓
Primary content
↓
Secondary content
```

Use fewer shades and stronger relationships.

---

# 18. Borders

Borders should establish structure, not decoration.

Prefer:

```text
border-zinc-200
dark:border-zinc-800
```

or similarly subtle values.

Avoid:

* thick borders
* bright outlines
* glowing borders
* multiple nested borders

Use borders when they help separate surfaces.

---

# 19. Shadows

Use shadows sparingly.

Prefer:

```text
0 1px 2px rgba(...)
```

or subtle elevation.

Avoid:

* huge shadows
* strong floating-card shadows
* glow
* colored shadows

Depth should be subtle.

---

# 20. Border Radius

Avoid rounding everything excessively.

Use a hierarchy:

```text
Page containers:
large radius

Cards:
medium radius

Controls:
small/medium radius

Icons:
small radius

Pills:
only when semantically appropriate
```

Do not put `rounded-2xl` or `rounded-full` on everything.

---

# 21. Micro-interactions

Use motion only when it communicates interaction.

Good:

* Button hover
* Arrow movement
* Subtle scale
* Active state
* Progress
* Expand/collapse
* Small opacity changes

Avoid:

* constant floating animations
* bouncing everything
* excessive spring animations
* decorative movement
* multiple simultaneous animations

Animation should feel **quiet and purposeful**.

---

# 22. FAQ Design

For FAQ sections, avoid making every question a separate floating card unless the product specifically calls for it.

Prefer a structured editorial list:

```text
FAQ

Frequently asked questions
Supporting explanation

──────────────────────────
Question                         +
──────────────────────────
Question                         +
──────────────────────────
Question                         +
──────────────────────────
```

Use:

* subtle dividers
* clear typography
* compact controls
* strong spacing
* restrained interaction

The FAQ should feel like part of the product, not a collection of cards.

---

# 23. CTA Design

Do not create a generic:

```text
┌──────────────────────────┐
│      Big headline        │
│      paragraph           │
│      [Button]            │
└──────────────────────────┘
```

Instead establish:

* small eyebrow
* strong headline
* concise supporting copy
* one clear primary action
* subtle supporting information

The CTA should feel like the natural conclusion of the page.

Avoid unnecessary:

* gradients
* glowing buttons
* floating shapes
* fake statistics
* decorative icons

---

# 24. Upload / Import UI

For upload interfaces, do NOT make the entire component:

```text
dashed border
giant upload icon
Upload button
```

Instead create a hierarchy:

```text
        Visual media composition

        Add a source video

        Short explanation

        [ Upload video ]

        MP4 · MOV · WebM
────────────────────────────────
[ Existing videos ] [ Try demo ]
```

The upload interaction should feel like a **designed workspace entry point**, not a file input.

Use visual storytelling such as:

* folder
* video file
* media tile
* upload indicator

But keep the illustration restrained.

---

# 25. Existing / Secondary Content

Secondary content should feel integrated rather than bolted on.

For lists:

* use compact rows
* clear metadata
* truncate long filenames
* keep delete actions subtle
* use hover states
* preserve hierarchy

Don't make secondary content visually louder than the primary workflow.

---

# 26. Responsive Design

Do not simply shrink desktop.

At mobile sizes:

* Recompose the layout
* Stack related elements
* Reduce visual density
* Preserve hierarchy
* Maintain touch-friendly targets
* Prevent horizontal overflow
* Keep important content visible
* Move decorative elements behind or around the main content

The mobile design should feel intentional.

---

# 27. Code Quality

When implementing:

* Prefer existing Tailwind utilities.
* Reuse existing components.
* Keep class names understandable.
* Extract genuinely reusable visual primitives.
* Avoid unnecessary abstractions.
* Avoid introducing dependencies for simple visuals.
* Use Lucide icons where appropriate.
* Use custom SVG/CSS compositions when an icon alone is insufficient.
* Preserve existing TypeScript types.
* Preserve existing behavior.

Do not turn a small component into an unnecessarily complicated design system.

---

# 28. Final Design Review

Before finishing, inspect the component as if you were reviewing a production PR.

Ask:

### Hierarchy

* What do I notice first?
* Is the primary action obvious?
* Is anything competing with it?

### Layout

* Are edges aligned?
* Is spacing consistent?
* Are proportions intentional?

### Visual quality

* Does this look designed or generated?
* Are there unnecessary effects?
* Are there too many visual elements?

### Product communication

* Does the visualization actually explain the feature?
* Could a user understand the feature without reading everything?

### Consistency

* Does it belong to the same product as the other components?
* Are typography, radius, borders and surfaces consistent?

### Theme

* Does light mode feel intentional?
* Does dark mode feel intentionally designed rather than color-inverted?

### Polish

* Are hover states subtle?
* Are controls aligned?
* Are icons optically centered?
* Is whitespace intentional?

---

# 29. The Final Rule

When making a design decision, prioritize in this order:

**1. Usability**

**2. Hierarchy**

**3. Layout**

**4. Spacing**

**5. Typography**

**6. Consistency**

**7. Color**

**8. Depth**

**9. Animation**

**10. Decoration**

Never reverse this order.

Do not add visual effects to compensate for weak layout.

Do not add components simply to make the UI look "more designed."

Do not redesign something that already works.

The goal is not to make the UI more complicated.

The goal is to make the existing UI feel **more intentional, more coherent, more functional, and more professionally designed.**

---

## Output Requirements

When I provide you with an existing component:

1. Analyze the existing design.
2. Identify the biggest sources of the "AI-generated" appearance.
3. Preserve the existing functionality.
4. Redesign the visual composition where necessary.
5. Give me the **complete updated component/code**, not just suggestions.
6. Do not modify unrelated parts of the application.
7. Keep the implementation production-ready.
8. Make light and dark mode intentional.
9. Prefer functional visualizations over decorative illustrations.
10. Make the final result feel like it belongs to a cohesive professional product.
