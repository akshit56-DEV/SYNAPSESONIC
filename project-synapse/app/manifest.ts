import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SynapseSonic",
    short_name: "SynapseSonic",
    description:
      "Turn any PDF into a spatial 3D study room. Voice tutor, interactive 3D knowledge terrarium, and hands-free webcam AR.",
    start_url: "/workspace",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#bef264",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
