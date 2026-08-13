@import "tailwindcss";

:root {
  --background: #0b1220;
  --foreground: #f1f5f9;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

body {
  background: var(--background);
  color: var(--foreground);
}

@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.55); }
  70% { box-shadow: 0 0 0 14px rgba(248, 113, 113, 0); }
  100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); }
}

.timer-pulse {
  animation: pulse-ring 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.fade-in-up {
  animation: fade-in-up 0.25s ease-out;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 8px;
}
