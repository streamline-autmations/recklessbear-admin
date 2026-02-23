import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  const logoUrl =
    "https://res.cloudinary.com/dzhwylkfr/image/upload/v1769410062/RB_LOGO_NEW_btabo8.png";

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
        <img
          src={logoUrl}
          alt=""
          width={144}
          height={144}
          style={{
            width: 144,
            height: 144,
            objectFit: "contain",
          }}
        />
      </div>
    ),
    {
      width: 192,
      height: 192,
    }
  );
}
