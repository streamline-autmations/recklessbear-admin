/// <reference lib="webworker" />

// Custom service worker logic compiled into the next-pwa generated sw.
// Handles push notifications + Badging API for the RecklessBear admin PWA.

declare const self: ServiceWorkerGlobalScope & {
  __rbUnreadLeadCount?: number;
};

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  badge?: number;
  icon?: string;
  data?: Record<string, unknown>;
}

function parsePushData(event: PushEvent): PushPayload {
  if (!event.data) return {};
  try {
    return event.data.json() as PushPayload;
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event: PushEvent) => {
  const payload = parsePushData(event);
  const title = payload.title || "New lead";
  const body = payload.body || "A new lead just came in.";
  const url = payload.url || "/leads";
  const tag = payload.tag || "rb-lead";

  self.__rbUnreadLeadCount = (self.__rbUnreadLeadCount ?? 0) + 1;
  const badgeCount =
    typeof payload.badge === "number" ? payload.badge : self.__rbUnreadLeadCount;

  const showPromise = self.registration.showNotification(title, {
    body,
    tag,
    icon: payload.icon || "/pwa-192.png",
    badge: "/favicon-32.png",
    data: { url, ...(payload.data || {}) },
    // `renotify` is supported by browsers but not in current TS lib types
    ...({ renotify: true } as Record<string, unknown>),
  });

  const badgePromise =
    "setAppBadge" in self.navigator
      ? (self.navigator as Navigator & { setAppBadge?: (n: number) => Promise<void> })
          .setAppBadge?.(badgeCount)
          .catch(() => undefined)
      : Promise.resolve();

  event.waitUntil(Promise.all([showPromise, badgePromise]));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const data = (event.notification.data as { url?: string }) || {};
  const targetUrl = data.url || "/leads";

  event.waitUntil(
    (async () => {
      self.__rbUnreadLeadCount = 0;
      if ("clearAppBadge" in self.navigator) {
        await (self.navigator as Navigator & { clearAppBadge?: () => Promise<void> })
          .clearAppBadge?.()
          .catch(() => undefined);
      }

      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname.startsWith(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === "rb-clear-badge") {
    self.__rbUnreadLeadCount = 0;
    if ("clearAppBadge" in self.navigator) {
      (self.navigator as Navigator & { clearAppBadge?: () => Promise<void> })
        .clearAppBadge?.()
        .catch(() => undefined);
    }
  }
});

export {};
