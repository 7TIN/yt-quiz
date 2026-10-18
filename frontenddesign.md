# Frontend Design — Ship Studio Primitives for Tailwind v4 + Next.js

> Source: `ship-studio/src/components/primitives/*` + `src/styles/components/*` + `src/styles/global/tokens-*.css` + `src/styles/global/base.css`.
> Dark-only system. App bg `#141414`.

---

## 1. Design tokens (`app/globals.css`)

```css
@import "tailwindcss";

@theme {
  --color-ss-app: #141414;
  --color-ss-panel: #1a1a1a;
  --color-ss-control: #282828;
  --color-ss-control-hover: #303030;
  --color-ss-selected: #393939;
  --color-ss-primary: #bcbcbc;
  --color-ss-secondary: #979797;
  --color-ss-muted: #767676;
  --color-ss-faint: #4e4e4e;
  --color-ss-inverse: #ffffff;
  --color-ss-on-accent: #141414;
  --color-ss-border: #282828;
  --color-ss-border-strong: #393939;
  --color-ss-focus: #2792ff;
  --color-ss-green-start: #26bf4f;
  --color-ss-green-mid: #35d35d;
  --color-ss-green-end: #46e76f;
  --color-ss-purple: #734ce0;
  --color-ss-purple-hover: #815beb;
  --color-ss-purple-text: #b89eff;
  --color-ss-warning: #e89a1c;
  --color-ss-error: #f44747;
  --color-ss-error-light: #ef4444;
  --color-ss-success: #35d35d;
  --font-ss-ui: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-ss-code: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

Scale: `space 1/2/4/6/8/10/12/16/24/32px`, `radius 2/4/6/8/12/999px`, `font 10/11/12/13/14/16/18/24/40px`, `transition 150ms ease`, `shadow-btn: 0 1px 2px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.15)`, `shadow-md 0 8px 24px rgba(0,0,0,.4)`, `shadow-lg 0 16px 48px rgba(0,0,0,.5)`, `disabled .45`, `active scale .96`.

---

## 2. Button family (`Button` / `IconButton` / `ToggleButton` / `MenuButton` / `TextButton` / Split)

```css
@layer components {
  .btn { appearance:none; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; gap:6px; height:30px; min-height:30px; padding:0 8px; border-radius:6px; border:1px solid transparent; font-family:var(--font-ss-ui); font-size:11px; line-height:1; font-weight:500; cursor:pointer; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.15); transition:background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease; }
  .btn:disabled { opacity:.45; cursor:not-allowed; }
  .btn:active:not(:disabled) { transform:scale(.96); }
  .btn:focus-visible { outline:2px solid #2792ff; outline-offset:-1px; }
  .btn__icon { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex:0 0 16px; }
  .btn__icon > svg { width:100%; height:100%; }
  .btn-default { background:#282828; color:#979797; }
  .btn-default:hover:not(:disabled) { background:#303030; color:#bcbcbc; }
  .btn-primary { background:linear-gradient(0deg,#26bf4f,#35d35d); color:#141414; }
  .btn-primary:hover:not(:disabled) { background:linear-gradient(0deg,#35d35d,#46e76f); }
  .btn-secondary { background:transparent; color:#979797; border-color:#282828; }
  .btn-secondary:hover:not(:disabled) { color:#bcbcbc; border-color:#393939; }
  .btn-danger { background:transparent; color:#ef4444; border-color:rgba(239,68,68,.3); }
  .btn-danger:hover:not(:disabled) { background:rgba(239,68,68,.1); }
  .btn-ghost { background:transparent; color:#979797; box-shadow:none; }
  .btn-ghost:hover:not(:disabled) { background:#303030; color:#bcbcbc; }
  .btn-warning { background:rgba(232,154,28,.15); color:#e89a1c; }
  .btn-warning:hover:not(:disabled) { border-color:#e89a1c; }
  .btn-variable { background:#734ce0; color:#bcbcbc; }
  .btn-variable:hover:not(:disabled) { background:#815beb; color:#fff; }
  .btn-default:is([aria-pressed="true"],[aria-expanded="true"],[data-selected="true"]),
  .btn-secondary:is([aria-pressed="true"],[aria-expanded="true"],[data-selected="true"]),
  .btn-ghost:is([aria-pressed="true"],[aria-expanded="true"],[data-selected="true"]) { background:#393939; color:#bcbcbc; }
  .btn-secondary:is([aria-pressed="true"],[aria-expanded="true"],[data-selected="true"]) { border-color:#393939; }
  .btn-compact { height:20px; min-height:20px; gap:4px; padding:0 6px; }
  .btn-medium { height:24px; min-height:24px; }
  .btn-large { height:36px; min-height:36px; gap:8px; padding:0 12px; font-size:12px; }
  .btn-fill { width:100%; } .btn-hug { width:fit-content; }
  .btn-icon-only { width:30px; min-width:30px; padding:0; }
  .btn-icon-only.btn-compact { width:20px; min-width:20px; height:20px; }
  .btn-icon-only.btn-large { width:36px; min-width:36px; }
  .btn .chevron-flipped { transform:rotate(180deg); }
  .btn-split { display:inline-flex; }
  .btn-split > .btn { border-radius:0; }
  .btn-split > .btn:first-child { border-radius:6px 0 0 6px; }
  .btn-split > .btn:last-child { border-radius:0 6px 6px 0; border-left-color:#282828; }
  .btn-text { display:inline-flex; height:auto; min-height:0; padding:0; border:none; border-radius:0; background:transparent; box-shadow:none; color:#979797; font:inherit; line-height:inherit; white-space:normal; }
  .btn-text:hover:not(:disabled) { color:#bcbcbc; text-decoration:underline; text-underline-offset:2px; }
  .btn-text:active:not(:disabled) { transform:none; }
  .btn-text-primary { color:#46e76f; } .btn-text-accent { color:#2792ff; } .btn-text-danger { color:#ef4444; }
}
```

```tsx
// components/ui/button.tsx — no deps
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
export type ButtonVariant = "default"|"primary"|"secondary"|"danger"|"ghost"|"warning"|"variable";
export type ButtonSize = "default"|"compact"|"medium"|"large";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; size?: ButtonSize; fill?: boolean; leftIcon?: ReactNode; rightIcon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant="default", size="default", fill, leftIcon, rightIcon, className, children, type="button", ...rest }, ref) {
  const cls = ["btn", `btn-${variant}`, size!=="default"?`btn-${size}`:"", fill?"btn-fill":"btn-hug", className??""].filter(Boolean).join(" ");
  return <button ref={ref} type={type} className={cls} {...rest}>
    {leftIcon && <span className="btn__icon">{leftIcon}</span>}{children}{rightIcon && <span className="btn__icon">{rightIcon}</span>}
  </button>;
});
export function IconButton({ icon, className, ...p }: Omit<ButtonProps,"children"|"leftIcon"|"rightIcon"> & { icon: ReactNode; "aria-label": string }) {
  return <Button {...p} className={`btn-icon-only ${className??""}`} leftIcon={icon} />;
}
export function ToggleButton({ pressed, ...p }: ButtonProps & { pressed: boolean }) {
  return <Button aria-pressed={pressed} {...p} />;
}
export function MenuButton({ expanded, ...p }: ButtonProps & { expanded: boolean }) {
  return <Button aria-haspopup="menu" aria-expanded={expanded} {...p} />;
}
export function TextButton({ className, ...p }: ButtonProps & { variant?: "default"|"primary"|"accent"|"danger" }) {
  const v = (p as {variant?:string}).variant ?? "default";
  const map: Record<string,string> = { default:"", primary:"btn-text-primary", accent:"btn-text-accent", danger:"btn-text-danger" };
  return <Button variant="ghost" {...p} className={`btn-text ${map[v]} ${className??""}`} />;
}
```

Utilities: base `inline-flex items-center justify-center gap-1.5 h-[30px] px-2 rounded-md border border-transparent text-[11px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.15)] active:scale-[0.96] disabled:opacity-45` + `default: bg-[#282828] text-[#979797] hover:bg-[#303030] hover:text-[#bcbcbc]` / `primary: bg-gradient-to-b from-[#35d35d] to-[#26bf4f] text-[#141414]` / `secondary: bg-transparent border-[#282828]` / `danger: text-[#ef4444] border-[rgba(239,68,68,0.3)]` / `ghost: bg-transparent shadow-none` / `warning: bg-[rgba(232,154,28,0.15)] text-[#e89a1c]` / `variable: bg-[#734ce0]`.

---

## 3. Toolbar buttons (Edit / Inspect / settings / Import / Open project)

Edit toggle = `ToggleButton variant=default|secondary` + 22×12 pill. Import/settings/Open project = plain `Button variant=default` (`Import`: `PullIcon 14`, `Open project`: `AddIcon 16` fill, settings gear: `IconButton SettingsIcon 12` 30px square).

```css
@layer components {
  .toolbar-toggle { display:inline-flex; align-items:center; justify-content:center; gap:6px; height:30px; min-height:30px; padding:0 8px; border-radius:6px; border:1px solid transparent; font-family:var(--font-ss-ui); font-size:11px; font-weight:500; line-height:1; background:#282828; color:#979797; box-shadow:0 1px 2px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.15); cursor:pointer; white-space:nowrap; transition:background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease; }
  .toolbar-toggle:hover:not(:disabled) { background:#303030; color:#bcbcbc; }
  .toolbar-toggle:active:not(:disabled) { transform:scale(.96); }
  .toolbar-toggle:focus-visible { outline:2px solid #2792ff; outline-offset:-1px; }
  .toolbar-toggle[data-on="true"] { background:#1a1a1a; border-color:#282828; }
  .toolbar-toggle[data-on="true"]:hover:not(:disabled) { color:#bcbcbc; border-color:#393939; background:#1a1a1a; }
  .toolbar-switch { position:relative; display:inline-block; width:22px; height:12px; margin-left:2px; background:#141414; border:1px solid #282828; border-radius:999px; }
  .toolbar-switch::after { content:""; position:absolute; top:1px; left:1px; width:8px; height:8px; border-radius:50%; background:#767676; transition:transform 150ms ease, background 150ms ease; }
  .toolbar-switch[data-on="true"] { background:#35d35d; border-color:#35d35d; }
  .toolbar-switch[data-on="true"]::after { transform:translateX(10px); background:#fff; }
}
```

```tsx
export function EditToolbarButton({ pressed, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean; icon: ReactNode }) {
  return <button type="button" data-on={pressed} aria-pressed={pressed} className="toolbar-toggle" {...rest}>
    {icon}<span data-on={pressed} aria-hidden className="toolbar-switch" />
  </button>;
}
// <EditToolbarButton pressed={on} icon={<EditIcon size={13}/>} aria-label="Edit" />
// Import: <Button variant="default" leftIcon={<PullIcon size={14}/>}>Import</Button>
// Open project: <Button variant="default" fill leftIcon={<AddIcon size={16}/>}>Open project</Button>
// Settings: <IconButton variant="default" icon={<SettingsIcon size={12}/>} aria-label="App settings" />
```

---

## 4. ModalFrame

Overlay fixed inset-0 `rgba(0,0,0,.7)` padding 16px, z 1000. Content w 480px max 90vw/vh, bg `#1a1a1a`, border `#282828`, radius 12px, shadow lg, z 1001. Header flex space-between padding 16px 24px, border-b `#282828`. Title 16px/600 `#bcbcbc`. Close = `IconButton ghost compact CloseIcon 16`.

```css
@layer components {
  .ss-overlay { position:fixed; inset:0; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px; }
  .ss-modal { background:#1a1a1a; border:1px solid #282828; border-radius:12px; box-shadow:0 16px 48px rgba(0,0,0,.5); z-index:1001; max-width:90vw; max-height:90vh; overflow:auto; width:480px; display:flex; flex-direction:column; }
  .ss-modal__header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 24px; border-bottom:1px solid #282828; }
  .ss-modal__title { font-size:16px; font-weight:600; color:#bcbcbc; display:flex; align-items:center; gap:8px; }
  .ss-modal__actions { display:flex; justify-content:flex-end; gap:6px; margin-top:24px; }
}
```

```tsx
// components/ui/modal.tsx
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="ss-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ss-modal" role="dialog" aria-modal="true">
        <div className="ss-modal__header"><div className="ss-modal__title">{title}</div>
          <button className="btn btn-ghost btn-compact btn-icon-only" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>, document.body);
}
```

---

## 5. Dropdown

Trigger = `Button`/`MenuButton`. Menu absolute `top 100% + 4px`, min-w 200px max-w 320px, bg `#1a1a1a`, border `#282828`, radius 8px, shadow md, padding 4px, z 100. Item flex gap 8px, padding 8px 12px, radius 4px, 13px, `#bcbcbc`; hover `rgba(255,255,255,.05)`; active `#46e76f`; danger `#ef4444` + hover `rgba(239,68,68,.1)`; disabled `.5`. Divider 1px `#282828` margin 4px 0.

```css
@layer components {
  .ss-dd { position:relative; display:inline-flex; }
  .ss-dd__menu { position:absolute; top:100%; left:0; margin-top:4px; z-index:100; width:max-content; min-width:200px; max-width:320px; padding:4px; background:#1a1a1a; border:1px solid #282828; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.4); }
  .ss-dd__menu--right { left:auto; right:0; }
  .ss-dd__item { display:flex; align-items:center; gap:8px; width:100%; padding:8px 12px; border:none; border-radius:4px; background:transparent; color:#bcbcbc; font-size:13px; text-align:left; cursor:pointer; }
  .ss-dd__item:hover:not(:disabled) { background:rgba(255,255,255,.05); }
  .ss-dd__item:focus-visible { outline:2px solid #2792ff; outline-offset:-1px; }
  .ss-dd__item:disabled { opacity:.5; cursor:not-allowed; }
  .ss-dd__item--active { color:#46e76f; }
  .ss-dd__item--danger { color:#ef4444; }
  .ss-dd__item--danger:hover:not(:disabled) { background:rgba(239,68,68,.1); }
  .ss-dd__divider { height:1px; margin:4px 0; background:#282828; }
}
```

```tsx
// components/ui/dropdown.tsx — minimal controlled version
import { useState, type ReactNode } from "react";
export function Dropdown({ trigger, children, align = "left" }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: ReactNode; align?: "left"|"right" }) {
  const [open, setOpen] = useState(false);
  return <div className="ss-dd">
    {trigger({ open, toggle: () => setOpen((v) => !v) })}
    {open && <div role="menu" className={`ss-dd__menu ${align === "right" ? "ss-dd__menu--right" : ""}`}>{children}</div>}
  </div>;
}
export function DropdownItem({ children, onSelect, danger, active }: { children: ReactNode; onSelect: () => void; danger?: boolean; active?: boolean }) {
  return <button type="button" role="menuitem" onClick={onSelect}
    className={`ss-dd__item ${danger ? "ss-dd__item--danger" : ""} ${active ? "ss-dd__item--active" : ""}`}>{children}</button>;
}
```

---

## 6. Tabs

List inline-flex gap 2px padding 2px, bg `#282828`, border `#282828`, radius 6px (tab radius 4px + 2px). Tab 20px h, padding-inline 12px, transparent, `#767676`; hover `#303030`/`#bcbcbc`; active transparent bg + `#bcbcbc` + sliding indicator `#393939` + btn shadow. Underline appearance: transparent list, 2px `#bcbcbc` bottom bar.

```css
@layer components {
  .ss-tabs__list { position:relative; box-sizing:border-box; display:inline-flex; align-items:center; gap:2px; padding:2px; background:#282828; border:1px solid #282828; border-radius:6px; }
  .ss-tabs__tab { position:relative; z-index:1; height:20px; min-height:20px; padding-inline:12px; border-radius:4px; background:transparent; border:1px solid transparent; box-shadow:none; color:#767676; font-size:11px; font-weight:500; cursor:pointer; display:inline-flex; align-items:center; }
  .ss-tabs__tab:hover:not(:disabled):not(.is-active) { background:#303030; color:#bcbcbc; }
  .ss-tabs__tab.is-active { color:#bcbcbc; }
  .ss-tabs__indicator { position:absolute; left:0; top:0; border-radius:4px; background:#393939; box-shadow:0 1px 2px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.15); pointer-events:none; }
  .ss-tabs__list--underline { gap:0; padding:0; background:transparent; border:none; border-radius:0; }
  .ss-tabs__list--underline .ss-tabs__indicator { background:transparent; box-shadow:none; }
  .ss-tabs__list--underline .ss-tabs__indicator::after { content:""; position:absolute; right:0; bottom:-1px; left:0; height:2px; border-radius:2px 2px 0 0; background:#bcbcbc; }
}
```

```tsx
// components/ui/tabs.tsx
import { useState, type ReactNode } from "react";
export function Tabs({ options, value, onChange, underline }: { options: readonly { value: string; label: ReactNode }[]; value: string; onChange: (v: string) => void; underline?: boolean }) {
  const [internal, setInternal] = useState(value ?? options[0]?.value);
  const v = value ?? internal;
  return <div className={`ss-tabs__list ${underline ? "ss-tabs__list--underline" : ""}`} role="tablist">
    {options.map((o) => (
      <button key={o.value} role="tab" aria-selected={v === o.value} onClick={() => { setInternal(o.value); onChange?.(o.value); }}
        className={`ss-tabs__tab ${v === o.value ? "is-active" : ""}`}>{o.label}</button>
    ))}
  </div>;
}
```

---

## 7. SegmentedControl

Tray inline-flex gap 2px padding 1px, bg `#282828`, border `#282828`, radius 6px, btn shadow. Child buttons transparent/shadowless radius 4px; hover `#303030`; pressed `#393939` + inset shadow.

```css
@layer components {
  .ss-seg { display:inline-flex; gap:2px; padding:1px; border:1px solid #282828; border-radius:6px; background:#282828; box-shadow:0 1px 2px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.15); }
  .ss-seg > .btn { border-color:transparent; border-radius:4px; background:transparent; box-shadow:none; }
  .ss-seg > .btn:hover:not(:disabled):not([aria-pressed="true"]) { background:#303030; }
  .ss-seg > .btn[aria-pressed="true"] { background:#393939; box-shadow:inset 0 1px 1px rgba(0,0,0,.15), inset 0 3px 3px rgba(0,0,0,.15); }
}
```

```tsx
export function SegmentedControl<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return <div className="ss-seg" role="group" aria-label={label}>
    {options.map((o) => <Button key={o.value} variant="default" size="compact" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</Button>)}
  </div>;
}
```

---

## 8. TextField

24px h (compact 20px), padding-inline 8px, 11px tabular, `#979797` → focus `#bcbcbc`, bg `#1a1a1a`, border `#393939`, radius 6px, btn shadow. Focus border/outline `#46e76f`. Invalid `#f44747`. Disabled `#767676` on `#141414` opacity .55. Code variant mono.

```css
@layer components {
  .ss-input { box-sizing:border-box; height:24px; min-width:0; padding:0 8px; font-family:var(--font-ss-ui); font-size:11px; font-variant-numeric:tabular-nums; color:#979797; background:#1a1a1a; border:1px solid #393939; border-radius:6px; box-shadow:0 1px 2px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.15); }
  .ss-input--compact { height:20px; }
  .ss-input--code { font-family:var(--font-ss-code); }
  .ss-input:focus { outline:1px solid #46e76f; outline-offset:-1px; color:#bcbcbc; }
  .ss-input::placeholder { color:#979797; }
  .ss-input:disabled { color:#767676; background:#141414; border-color:#282828; opacity:.55; cursor:not-allowed; }
  .ss-input--invalid, .ss-input--invalid:focus { color:#f44747; border-color:#f44747; outline-color:#f44747; }
}
```

```tsx
export function TextField({ invalid, className, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...p} className={`ss-input ${invalid ? "ss-input--invalid" : ""} ${className ?? ""}`} aria-invalid={invalid} />;
}
```

---

## 9. ValueField + PropertyField

ValueField: 24px unit+number combo, bg `#1a1a1a`, border `#393939`, radius 6px; focus/open border `#46e76f`; invalid `#f44747`; variable mode purple text `#b89eff` on `rgba(135,95,253,.15)` padding 2px 4px radius 4px. Menu fixed, bg `#1a1a1a`, radius 8px, option 24px hover `#303030`, selected `#393939`.

PropertyField: `value` = text-cursor row (bg `#282828`, border `#282828`, radius 4px, hover `#303030`/`#393939`); `select` = button look; `variable` = purple (`#b89eff` on `rgba(135,95,253,.15)`, border `#734ce0`, hover `#815beb`).

```css
@layer components {
  .ss-value { display:inline-flex; align-items:stretch; box-sizing:border-box; width:100%; height:24px; min-width:0; overflow:hidden; color:#979797; background:#1a1a1a; border:1px solid #393939; border-radius:6px; box-shadow:0 1px 2px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.15); }
  .ss-value:focus-within { color:#bcbcbc; border-color:#46e76f; }
  .ss-value--invalid { color:#f44747; border-color:#f44747; }
  .ss-value--variable { color:#b89eff; background:rgba(135,95,253,.15); border-color:transparent; border-radius:4px; padding:2px 4px; }
  .ss-value__input { flex:1 1 auto; width:0; min-width:0; padding:0 4px 0 6px; color:inherit; background:transparent; border:0; outline:0; font-size:11px; font-variant-numeric:tabular-nums; }
  .ss-value__unit { flex:0 0 auto; min-width:16px; padding-inline:2px; color:inherit; background:transparent; border:0; font-size:11px; cursor:pointer; }
  .ss-value__unit:hover { background:#303030; }
  .ss-prop { display:inline-flex; align-items:center; gap:8px; min-width:0; padding:0 8px; min-height:30px; border:1px solid #282828; border-radius:4px; background:#282828; color:#bcbcbc; font:inherit; cursor:text; }
  .ss-prop--compact { min-height:20px; }
  .ss-prop--select { height:30px; padding:0 8px; border-radius:6px; background:#282828; color:#979797; font-size:11px; font-weight:500; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.15); }
  .ss-prop--variable { color:#b89eff; background:rgba(135,95,253,.15); border-color:#734ce0; }
  .ss-prop--variable:hover { background:rgba(135,95,253,.4); border-color:#815beb; }
}
```

---

## 10. Tooltip / Spinner / PixelLoader

Tooltip: fixed, max-w 320px, padding 8px, bg `#141414`, border `#282828`, radius 6px, 12px `#bcbcbc`, opacity slide 150ms. Spinner: 20px (sm 14, lg 32/3px), 2px `#282828` + `currentColor` top, spin .8s. PixelLoader: 5×5 grid (default ripple), 20px (sm 14, lg 30), color `#46e76f`, glow 4/8px.

```css
@layer components {
  .ss-tooltip { position:fixed; z-index:1100; max-width:320px; padding:8px; border:1px solid #282828; border-radius:6px; background:#141414; box-shadow:0 8px 24px rgba(0,0,0,.4); color:#bcbcbc; font-size:12px; line-height:1; white-space:pre-wrap; pointer-events:none; opacity:0; transform:translateY(-4px); transition:opacity 150ms ease, transform 150ms ease; }
  .ss-tooltip[data-shown] { opacity:1; transform:none; }
  .ss-spinner { width:20px; height:20px; flex-shrink:0; border:2px solid #282828; border-top-color:currentColor; border-radius:999px; animation:ss-spin .8s linear infinite; }
  .ss-spinner--sm { width:14px; height:14px; } .ss-spinner--lg { width:32px; height:32px; border-width:3px; }
  @keyframes ss-spin { to { transform:rotate(360deg); } }
  .ss-pixels { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:0.5px; width:20px; height:20px; color:#46e76f; }
  .ss-pixels--sm { width:14px; height:14px; } .ss-pixels--lg { width:30px; height:30px; }
  .ss-pixels > span { background:currentColor; opacity:.16; animation:ss-pixels-pulse 1.2s ease-in-out infinite; }
  @keyframes ss-pixels-pulse { 0%,100% { opacity:.16; } 42% { opacity:1; } }
}
```

```tsx
export function Spinner({ size = "md", label = "Loading" }: { size?: "sm"|"md"|"lg"; label?: string }) {
  return <div className={`ss-spinner ${size !== "md" ? `ss-spinner--${size}` : ""}`} role="status" aria-label={label} />;
}
export function Tooltip({ content, children }: { content: string; children: React.ReactElement }) {
  return <span data-tooltip={content} title={content}>{children}</span>; // pair with .ss-tooltip host or native title
}
```

---

## 11. EmptyState / Toasts / DockablePanel / ResizeHandle / MiddleTruncate / Typography

```css
@layer components {
  .ss-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:32px 16px; text-align:center; color:#979797; }
  .ss-empty__icon { color:#767676; }
  .ss-empty__title { font-size:16px; font-weight:600; color:#bcbcbc; }
  .ss-empty__desc { font-size:13px; color:#979797; max-width:360px; line-height:1.5; }
  .ss-toast-wrap { position:fixed; top:10px; right:14px; display:flex; flex-direction:column; align-items:flex-end; gap:8px; z-index:10000; pointer-events:none; }
  .ss-toast { display:flex; align-items:center; gap:10px; padding:12px 16px; background:#1a1a1a; border:1px solid #282828; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.4); font-size:13px; color:#bcbcbc; pointer-events:auto; width:fit-content; max-width:420px; animation:ss-toast-in .3s ease; }
  .ss-toast--success .ss-toast__icon { color:#35d35d; } .ss-toast--error .ss-toast__icon { color:#ef4444; } .ss-toast--info .ss-toast__icon { color:#46e76f; }
  @keyframes ss-toast-in { from { transform:translateX(100%); opacity:0; } to { transform:none; opacity:1; } }
  .ss-dock-surface { position:fixed; min-width:0; min-height:0; overflow:hidden; }
  .ss-dock-surface--floating { border:1px solid #303030; border-radius:8px; box-shadow:0 12px 28px rgba(0,0,0,.38); }
  .ss-resize { position:relative; width:1px; align-self:stretch; flex-shrink:0; background:#282828; cursor:col-resize; }
  .ss-resize:hover, .ss-resize:active, .ss-resize:focus-visible { background:#393939; }
  .ss-resize--h { width:auto; height:1px; cursor:row-resize; }
  .ss-truncate { display:block; min-width:0; max-width:100%; overflow:hidden; white-space:nowrap; }
  .ss-h1 { font-size:40px; font-weight:500; line-height:1; letter-spacing:-2px; text-wrap:balance; }
  .ss-h4 { font-size:16px; font-weight:500; line-height:1; }
  .ss-control { font-size:11px; font-weight:400; line-height:1; }
  .ss-control-b { font-size:11px; font-weight:600; line-height:1; }
  .ss-hint { color:#767676; font-size:12px; }
  .ss-label { font-size:11px; font-weight:600; letter-spacing:.56px; }
}
```

```tsx
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="ss-empty">{icon && <div className="ss-empty__icon">{icon}</div>}
    <div className="ss-empty__title">{title}</div>
    {description && <div className="ss-empty__desc">{description}</div>}{action}</div>;
}
export function Toasts({ toasts }: { toasts: { id: number; type: "success"|"error"|"info"; message: string }[] }) {
  return <div className="ss-toast-wrap">{toasts.map((t) => (
    <div key={t.id} className={`ss-toast ss-toast--${t.type}`}><span className="ss-toast__icon">●</span><span>{t.message}</span></div>))}</div>;
}
```
