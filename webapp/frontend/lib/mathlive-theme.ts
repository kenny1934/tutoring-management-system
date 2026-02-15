/** Shared MathLive virtual keyboard theme — warm brown palette with dark mode. */
export const KEYBOARD_THEME_CSS = `
:root {
  --keyboard-zindex: 10000;
  --keyboard-accent-color: #a0704b;
  --keyboard-background: #f5ede3;
  --keyboard-border: #e8d4b8;
  --keycap-background: #fff;
  --keycap-background-hover: #faf6f1;
  --keycap-border: #e8d4b8;
  --keycap-border-bottom: #d4c0a8;
  --keycap-text: #1f2937;
  --keycap-text-active: #fff;
  --keycap-secondary-background: #e8d4b8;
  --keycap-secondary-background-hover: #ddd0be;
  --keycap-secondary-text: #4b3621;
  --keycap-secondary-border: #d4c0a8;
  --keycap-secondary-border-bottom: #c4ad94;
  --keyboard-toolbar-text: #4b3621;
  --keyboard-toolbar-text-active: #a0704b;
  --keyboard-toolbar-background-hover: #ede0cf;
}
@media (prefers-color-scheme: dark) {
  :root {
    --keyboard-background: #1e1a15;
    --keyboard-border: #6b5a4a;
    --keycap-background: #2a2518;
    --keycap-background-hover: #3d3628;
    --keycap-border: #6b5a4a;
    --keycap-border-bottom: #4a3d30;
    --keycap-text: #e3d5c5;
    --keycap-secondary-background: #3d3628;
    --keycap-secondary-background-hover: #4d4638;
    --keycap-secondary-text: #e3d5c5;
    --keycap-secondary-border: #6b5a4a;
    --keycap-secondary-border-bottom: #4a3d30;
    --keyboard-toolbar-text: #c9b99a;
    --keyboard-toolbar-text-active: #c9a96e;
    --keyboard-toolbar-background-hover: #3d3628;
  }
}
`;
