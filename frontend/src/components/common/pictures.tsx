import { ImageOff, Shield, User } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToken } from "@/state/queries";
import { cn } from "@/lib/utils";

/** The URL of the same picture at its full size (no `size`), for the zoom. */
function fullSize(url: string) {
  const [path, query = ""] = url.split("?");
  const q = new URLSearchParams(query);
  q.delete("size");
  const rest = q.toString();
  return rest ? `${path}?${rest}` : path;
}

/** Picture of the loaded game (the URL carries the game's token); a missing or broken file shows `fallback`. A click
 * opens it big in a dialog (`zoom` = false turns that off). */
function GameImage({
  url,
  alt,
  className,
  fallback,
  available = true,
  zoom = true,
}: {
  url: string;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
  available?: boolean;
  zoom?: boolean;
}) {
  const token = useToken();
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const src = `${url}${url.includes("?") ? "&" : "?"}v=${token}`;
  if (!available || failed === src)
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground/50",
          className,
        )}
      >
        {fallback}
      </span>
    );
  const big = `${fullSize(url)}${fullSize(url).includes("?") ? "&" : "?"}v=${token}`;
  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn("object-contain", zoom && "cursor-zoom-in", className)}
        onError={() => setFailed(src)}
        onClick={
          zoom
            ? (e) => {
                e.stopPropagation(); // a picture inside a clickable row opens itself, not the row
                setOpen(true);
              }
            : undefined
        }
      />
      {zoom && (
        // React events of the dialog (a portal) still bubble up the component tree: a row around the picture must
        // not get the clicks of the dialog or of its backdrop
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent width="picture">
              <DialogTitle className="sr-only">{alt || "picture"}</DialogTitle>
              <div className="flex max-h-[80vh] items-center justify-center overflow-auto rounded bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
                {open && (
                  <img
                    src={big}
                    alt={alt}
                    className="h-[70vh] w-full object-contain"
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>
        </span>
      )}
    </>
  );
}

export function Crest({
  id,
  size = 64,
  className,
  noBackground,
  available,
}: {
  id: number;
  size?: number;
  className?: string;
  noBackground?: boolean;
  available?: boolean;
}) {
  return (
    <GameImage
      url={`/api/image/crest/${id}?size=${size}${noBackground ? "&nobg=true" : ""}`}
      alt=""
      className={className}
      available={available}
      fallback={<Shield className="size-1/2" />}
    />
  );
}

export function Photo({
  id,
  size = 64,
  className,
  available,
}: {
  id: number;
  size?: number;
  className?: string;
  available?: boolean;
}) {
  return (
    <GameImage
      url={`/api/image/photo/${id}?size=${size}`}
      alt=""
      className={className}
      available={available}
      fallback={<User className="size-1/2" />}
    />
  );
}

export function LeagueImage({
  id,
  kind = "logo",
  size,
  className,
  available,
}: {
  id: number;
  kind?: "logo" | "banner";
  size?: number;
  className?: string;
  available?: boolean;
}) {
  return (
    <GameImage
      url={`/api/image/league/${id}/${kind}${size ? `?size=${size}` : ""}`}
      alt=""
      className={className}
      available={available}
      fallback={<ImageOff className="size-1/2" />}
    />
  );
}

export function Flag({
  id,
  size = 32,
  className,
  available,
  fallback = null,
}: {
  id: number | null;
  size?: number;
  className?: string;
  available?: boolean;
  fallback?: React.ReactNode;
}) {
  if (id === null) return null;
  return (
    <GameImage
      url={`/api/image/flag/${id}?size=${size}`}
      alt=""
      className={className}
      available={available}
      fallback={fallback}
    />
  );
}

export function StadiumImage({
  id,
  variant,
  size,
  className,
}: {
  id: number;
  variant: number;
  size?: number;
  className?: string;
}) {
  return (
    <GameImage
      url={`/api/image/stadium/${id}/${variant}${size ? `?size=${size}` : ""}`}
      alt=""
      className={className}
      fallback={<ImageOff className="size-1/3" />}
    />
  );
}

/** An advertising board file (`name` = its file name): its 512x1024 picture, 16 bands. */
export function AdboardImage({
  name,
  size,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <GameImage
      url={`/api/image/adboard/${encodeURIComponent(name)}${size ? `?size=${size}` : ""}`}
      alt=""
      className={className}
      fallback={<ImageOff className="size-1/2" />}
    />
  );
}

export function KitImage({
  team,
  type,
  part,
  size,
  className,
}: {
  team: number;
  type: number;
  part: "jersey" | "shorts";
  size?: number;
  className?: string;
}) {
  return (
    <GameImage
      url={`/api/image/kit/${team}/${type}/${part}${size ? `?size=${size}` : ""}`}
      alt=""
      className={className}
      fallback={<ImageOff className="size-1/3" />}
    />
  );
}

export function ColorDot({
  rgb,
  className,
}: {
  rgb: (number | null)[] | null | undefined;
  className?: string;
}) {
  if (!rgb || rgb.some((v) => v === null)) return null;
  return (
    <span
      className={cn("inline-block size-4 rounded-full border", className)}
      style={{ background: `rgb(${rgb.join(",")})` }}
      title={`RGB ${rgb.join(", ")}`}
    />
  );
}

/** A boot, glove or ball of the game (`kind` = its list), drawn from its files. */
export function EquipmentImage({
  kind,
  code,
  size,
  className,
}: {
  kind: string;
  code: number;
  size?: number;
  className?: string;
}) {
  return (
    <GameImage
      url={`/api/image/equipment/${kind}/${code}${size ? `?size=${size}` : ""}`}
      alt=""
      className={className}
      fallback={<ImageOff className="size-1/2" />}
    />
  );
}
