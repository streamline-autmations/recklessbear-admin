"use client";

function isProbablyImage(url: string) {
  const u = url.toLowerCase();
  return (
    u.includes("storage.tally.so") ||
    u.endsWith(".jpg") ||
    u.endsWith(".jpeg") ||
    u.endsWith(".png") ||
    u.endsWith(".webp") ||
    u.endsWith(".gif")
  );
}

function fileNameFromUrl(url: string) {
  try {
    const clean = url.split("?")[0];
    return clean.split("/").pop() || "attachment";
  } catch {
    return "attachment";
  }
}

export function AttachmentGallery({ attachments }: { attachments?: string[] | null }) {
  if (!attachments?.length) return <div className="text-sm text-muted-foreground">No attachments</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {attachments.map((url, idx) => {
          const isImg = isProbablyImage(url);
          const fname = fileNameFromUrl(url);

          return (
            <div
              key={`${url}-${idx}`}
              className="rounded-lg border border-border bg-muted/20 overflow-hidden"
            >
              {isImg ? (
                <a href={url} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={url}
                    alt={fname}
                    className="w-full h-44 object-cover hover:opacity-90 transition"
                    loading="lazy"
                  />
                </a>
              ) : (
                <a href={url} target="_blank" rel="noreferrer" className="block p-3 text-sm">
                  <div className="font-medium truncate">{fname}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Open file</div>
                  <div className="text-xs text-muted-foreground truncate mt-2">{url}</div>
                </a>
              )}

              <div className="flex items-center justify-between gap-2 p-2 border-t border-border">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-2 py-1 rounded-md bg-background hover:bg-muted transition"
                >
                  View
                </a>
                <a
                  href={url}
                  download={fname}
                  className="text-xs px-2 py-1 rounded-md bg-background hover:bg-muted transition"
                >
                  Download
                </a>
              </div>
            </div>
          );
        })}
    </div>
  );
}
