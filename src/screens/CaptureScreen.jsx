import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, CheckCircle2, XCircle, RotateCcw, Copy } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, mono } from "../lib/tokens";

export default function CaptureScreen({ onDone }) {
  const { restaurantId: RESTAURANT_ID } = useAuth();
  const [status, setStatus] = useState("idle"); // idle | uploading | processing | done | error
  const [fileName, setFileName] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [batchResults, setBatchResults] = useState([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCurrent, setBatchCurrent] = useState(0);
  const [batchFileName, setBatchFileName] = useState("");
  const fileInputRef = useRef(null);

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setStatus("uploading");

    const path = `${RESTAURANT_ID}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("invoices").upload(path, file);

    if (uploadError) {
      setErrorMsg(uploadError.message);
      setStatus("error");
      return;
    }

    setStatus("processing");
    const { data, error: fnError } = await supabase.functions.invoke("extract-invoice", {
      body: { restaurant_id: RESTAURANT_ID, storage_path: path },
    });

    if (fnError) {
      let detail = fnError.message;
      try {
        // supabase-js puts the raw Response on fnError.context for FunctionsHttpError;
        // the real error message is in the JSON body our function returns.
        if (fnError.context && typeof fnError.context.json === "function") {
          const body = await fnError.context.json();
          detail = body?.error || detail;
        }
      } catch (_) {
        // fall back to the generic message if we can't parse a body
      }
      setErrorMsg(detail);
      setStatus("error");
      return;
    }

    // Fetch a quick summary of what was extracted, for the confirmation screen
    const { data: lineItems } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", data.invoice_id);

    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("*, suppliers(name)")
      .eq("id", data.invoice_id)
      .single();

    setResult({
      supplier: invoiceRow?.suppliers?.name || invoiceRow?.raw_extraction?.supplier_name || "Unknown",
      itemCount: lineItems?.length || 0,
      needsReview: (lineItems || []).filter((i) => i.needs_review).length,
      total: invoiceRow?.invoice_total || 0,
      matchedExistingSupplier: data?.matched_existing_supplier || null,
      supplierMatchMethod: data?.supplier_match_method || null,
      rawSupplierName: invoiceRow?.raw_extraction?.supplier_name || null,
    });
    setStatus("done");
  }

  async function extractSingleFile(file) {
    const path = `${RESTAURANT_ID}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("invoices").upload(path, file);
    if (uploadError) {
      return { fileName: file.name, ok: false, detail: uploadError.message };
    }

    const { data, error: fnError } = await supabase.functions.invoke("extract-invoice", {
      body: { restaurant_id: RESTAURANT_ID, storage_path: path },
    });

    if (fnError) {
      let detail = fnError.message;
      try {
        if (fnError.context && typeof fnError.context.json === "function") {
          const body = await fnError.context.json();
          detail = body?.error || detail;
        }
      } catch (_) {}
      const isDuplicate = detail?.startsWith("Duplicate:");
      return { fileName: file.name, ok: false, duplicate: isDuplicate, detail };
    }

    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("*, suppliers(name)")
      .eq("id", data.invoice_id)
      .single();

    return {
      fileName: file.name,
      ok: true,
      supplier: invoiceRow?.suppliers?.name || invoiceRow?.raw_extraction?.supplier_name || "Unknown",
      total: invoiceRow?.invoice_total || 0,
    };
  }

  async function handleBatchFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setStatus("batch-processing");
    setBatchTotal(files.length);
    setBatchCurrent(0);
    setBatchResults([]);

    const results = [];
    for (let i = 0; i < files.length; i++) {
      setBatchCurrent(i + 1);
      setBatchFileName(files[i].name);
      const result = await extractSingleFile(files[i]);
      results.push(result);
      setBatchResults([...results]);
    }

    setStatus("batch-done");
  }

  function resetBatch() {
    setStatus("idle");
    setBatchResults([]);
    setBatchTotal(0);
    setBatchCurrent(0);
    setBatchFileName("");
  }

  function reset() {
    setStatus("idle");
    setFileName(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 76px)" }}>
      <div style={{ padding: "24px 20px 8px" }}>
        <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: textMuted, marginBottom: 4 }}>
          New Invoice
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Photo in hand</h1>
        <div style={{ color: textMuted, fontSize: 13, marginTop: 6 }}>
          Snap the invoice or pick one from your photos — we'll read it automatically.
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px" }}>
        {status === "idle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                background: card,
                border: "1px dashed #45413A",
                borderRadius: 14,
                padding: "40px 20px",
                cursor: "pointer",
              }}
            >
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#3A2E1C", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Camera size={24} color={accent} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Take a photo</div>
              <div style={{ fontSize: 12, color: textMuted }}>Opens your camera</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: "none",
                border: "1px solid #35322D",
                borderRadius: 10,
                padding: "14px",
                cursor: "pointer",
                color: textMuted,
                fontSize: 13,
              }}
            >
              <ImageIcon size={15} />
              Choose from library or PDF (multiple OK)
              <input type="file" accept="image/*,application/pdf" multiple onChange={handleBatchFileSelect} style={{ display: "none" }} />
            </label>
          </div>
        )}

        {(status === "uploading" || status === "processing") && (
          <div style={{ background: card, border: "1px solid #35322D", borderRadius: 14, padding: "36px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
            <Loader2 size={30} color={accent} style={{ animation: "spin 1s linear infinite" }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{status === "uploading" ? "Uploading…" : "Reading invoice…"}</div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 4, fontFamily: mono }}>{fileName}</div>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {status === "done" && result && (
          <div style={{ background: card, border: `1px solid ${good}`, borderRadius: 14, padding: "28px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <CheckCircle2 size={30} color={good} />
            <div style={{ fontWeight: 600, fontSize: 16 }}>Invoice added</div>
            <div style={{ fontSize: 13, color: textMuted }}>{result.supplier}</div>
            {result.matchedExistingSupplier && (
              <div style={{ fontSize: 11, color: accent, maxWidth: 260 }}>
                Matched to existing supplier via {result.supplierMatchMethod === "ai" ? "AI" : "similarity match"} — invoice read as "{result.rawSupplierName}"
              </div>
            )}
            <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 18, color: accent }}>{result.itemCount}</div>
                <div style={{ fontSize: 11, color: textMuted }}>items found</div>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 18, color: accent }}>{result.needsReview}</div>
                <div style={{ fontSize: 11, color: textMuted }}>need review</div>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 18, color: textPrimary }}>${Number(result.total).toFixed(2)}</div>
                <div style={{ fontSize: 11, color: textMuted }}>total</div>
              </div>
            </div>
            <button
              onClick={onDone}
              style={{ width: "100%", marginTop: 12, background: accent, border: "none", borderRadius: 10, padding: "13px", color: "#1C1B1A", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              Review now
            </button>
            <button onClick={reset} style={{ width: "100%", background: "none", border: "none", color: textMuted, fontSize: 13, padding: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <RotateCcw size={13} /> Upload another
            </button>
          </div>
        )}

        {status === "error" && (
          errorMsg?.startsWith("Duplicate:") ? (
            <div style={{ background: card, border: `1px solid ${accent}`, borderRadius: 14, padding: "28px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <Copy size={26} color={accent} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>Already uploaded</div>
              <div style={{ fontSize: 13, color: textMuted, maxWidth: 280 }}>{errorMsg.replace(/^Duplicate:\s*/, "")}</div>
              <button onClick={reset} style={{ marginTop: 8, background: accent, border: "none", borderRadius: 10, padding: "12px 20px", color: "#1C1B1A", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Upload a different invoice
              </button>
            </div>
          ) : (
            <div style={{ background: card, border: `1px solid ${danger}`, borderRadius: 14, padding: "28px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <XCircle size={28} color={danger} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>Couldn't read that invoice</div>
              <div style={{ fontSize: 12, color: textMuted, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left", background: "#2A1E1B", border: "1px solid #4A2E28", borderRadius: 6, padding: 8, maxHeight: 200, overflowY: "auto" }}>{errorMsg || "Try retaking the photo with better lighting, or upload the PDF directly."}</div>
              <button onClick={reset} style={{ marginTop: 8, background: accent, border: "none", borderRadius: 10, padding: "12px 20px", color: "#1C1B1A", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Try again
              </button>
            </div>
          )
        )}
        {status === "batch-processing" && (
          <div style={{ background: card, border: "1px solid #35322D", borderRadius: 14, padding: "36px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
            <Loader2 size={30} color={accent} style={{ animation: "spin 1s linear infinite" }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                Processing {batchCurrent} of {batchTotal}…
              </div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 4, fontFamily: mono }}>{batchFileName}</div>
            </div>
            {batchResults.length > 0 && (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
                {batchResults.map((r, i) => (
                  <div key={i} style={{ fontSize: 11, color: r.ok ? good : r.duplicate ? accent : danger, fontFamily: mono }}>
                    {r.ok ? "✓" : r.duplicate ? "⊙" : "✗"} {r.fileName}
                  </div>
                ))}
              </div>
            )}
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {status === "batch-done" && (
          <div style={{ background: card, border: `1px solid ${good}`, borderRadius: 14, padding: "24px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <CheckCircle2 size={30} color={good} />
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {batchResults.filter((r) => r.ok).length} of {batchTotal} invoices added
            </div>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              {batchResults.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#2C2A26",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                  }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ color: textPrimary }}>{r.ok ? r.supplier : r.fileName}</div>
                    <div style={{ color: textMuted, fontSize: 11, fontFamily: mono }}>
                      {r.ok ? `$${Number(r.total).toFixed(2)}` : r.duplicate ? "Already uploaded" : "Failed to read"}
                    </div>
                  </div>
                  <div style={{ color: r.ok ? good : r.duplicate ? accent : danger }}>
                    {r.ok ? "✓" : r.duplicate ? "⊙" : "✗"}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={onDone}
              style={{ width: "100%", marginTop: 12, background: accent, border: "none", borderRadius: 10, padding: "13px", color: "#1C1B1A", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              Review now
            </button>
            <button onClick={resetBatch} style={{ width: "100%", background: "none", border: "none", color: textMuted, fontSize: 13, padding: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <RotateCcw size={13} /> Upload more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
