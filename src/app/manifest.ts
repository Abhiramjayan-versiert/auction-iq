import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AUCTION IQ",
    short_name: "AUCTION IQ",
    description: "Live auction intelligence: purse maths, competitor tracking, Smart Bid and crew dashboards.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["sports", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My auctions", url: "/dashboard" },
      { name: "Join with a code", url: "/join" },
      { name: "New tracker", url: "/trackers/new" },
    ],
  };
}
