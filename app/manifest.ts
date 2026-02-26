import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "reckless admin",
    short_name: "Reckless",
    id: "/",
    scope: "/",
    start_url: "/leads?source=pwa",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#ffffff",
    theme_color: "#0b1f3b",
    prefer_related_applications: false,
    icons: [
      {
        src: "/pwa-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/pwa-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/pwa-maskable-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa-maskable-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
