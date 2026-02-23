import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "reckless admin",
    short_name: "Reckless",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1f3b",
    orientation: "landscape",
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
    ],
  };
}
