import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

export function isTauriRuntime() {
  return Boolean((window as TauriWindow).__TAURI_INTERNALS__);
}

export function appFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (isTauriRuntime()) return tauriFetch(input.toString(), init);
  return window.fetch(input, init);
}
