import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0b1f3b",
          color: "#ffffff",
          fontSize: 320,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        D
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
