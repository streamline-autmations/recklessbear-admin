import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  const logoUrl =
    "https://res.cloudinary.com/dzhwylkfr/image/upload/v1769410062/Logo-Black_tl2hbv.png";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
        }}
      >
        <img src={logoUrl} alt="" width={28} height={28} style={{ objectFit: "contain" }} />
      </div>
    ),
    {
      width: 32,
      height: 32,
    }
  );
}
