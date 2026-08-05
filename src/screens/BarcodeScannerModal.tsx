import { useEffect, useRef, useState } from "react";
import { X, ScanLine, PackageSearch } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../lib/database.types";
import { accent, danger, textMuted } from "../lib/tokens";

type InventoryItem = Tables<"inventory_items">;

interface BarcodeScannerModalProps {
  restaurantId: string;
  onClose: () => void;
}

// Real barcode decoding (UPC/EAN/Code128, etc.) via ZXing - distinct from
// jsQR elsewhere in the app, which only reads QR codes. 1D barcodes and QR
// codes use fundamentally different encodings, so this needed its own
// decoder, not a reuse of the existing QR-scan code.
export default function BarcodeScannerModal({ restaurantId, onClose }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState("");
  const [foundItem, setFoundItem] = useState<InventoryItem | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    let controls: { stop: () => void } | null = null;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (cancelled || !result || looking || foundItem) return;
        handleDetected(result.getText());
      })
      .then((c) => {
        if (cancelled) {
          c.stop();
        } else {
          controls = c;
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't access the camera. Check that this site has camera permission.");
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDetected(code: string) {
    setLooking(true);
    setScanning(false);
    const { data } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("barcode", code)
      .maybeSingle();

    if (data) {
      setFoundItem(data);
      setNotFoundCode(null);
    } else {
      setNotFoundCode(code);
      setFoundItem(null);
    }
    setLooking(false);
  }

  function scanAgain() {
    setFoundItem(null);
    setNotFoundCode(null);
    setScanning(true);
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000000", zIndex: 1000, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px" }}>
        <div style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <ScanLine size={16} /> Scan a barcode
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={16} color="#FFFFFF" />
        </button>
      </div>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
        {scanning && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "70%", height: 120, border: "2px solid rgba(255,255,255,0.8)", borderRadius: 8 }} />
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#FDECEC", color: danger, padding: "12px 18px", fontSize: 13 }}>{error}</div>
      )}

      {(foundItem || notFoundCode) && (
        <div style={{ background: "#FFFFFF", borderRadius: "16px 16px 0 0", padding: "20px 18px" }}>
          {foundItem ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <PackageSearch size={18} color={accent} />
                <div style={{ fontSize: 16, fontWeight: 700 }}>{foundItem.name}</div>
              </div>
              <div style={{ fontSize: 14, color: textMuted, fontFamily: "monospace", marginBottom: 16 }}>
                {foundItem.current_stock ?? 0} / {foundItem.par_level ?? "no par set"} {foundItem.unit}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: textMuted, marginBottom: 16 }}>
              No item on file with barcode <span style={{ fontFamily: "monospace" }}>{notFoundCode}</span>.
            </div>
          )}
          <button
            onClick={scanAgain}
            style={{ width: "100%", background: accent, border: "none", borderRadius: 8, padding: 12, color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            Scan another
          </button>
        </div>
      )}
    </div>
  );
}
