"use client";

import { useCallback, useRef, useState } from "react";

type UploadedFile = {
  name: string;
  type: string;
  url: string;
};

type Room = {
  name: string;
  approxWidthFt: number | null;
  approxLengthFt: number | null;
  notes?: string;
};

type ParsedFloorPlan = {
  rooms: Room[];
  totalApproxSqFt: number | null;
  scaleFound: boolean;
  warnings: string[];
};

const ACCEPTED = ["image/png", "image/jpeg"];
const ACCEPT_ATTR = ".png,.jpg,.jpeg";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function FloorPlanUploader() {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParsedFloorPlan | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = useCallback(async (raw: File) => {
    if (!ACCEPTED.includes(raw.type)) {
      setError("Only PNG and JPG files are supported.");
      return;
    }
    if (raw.size > MAX_FILE_SIZE) {
      setError("File exceeds the 10 MB limit.");
      return;
    }
    setError(null);
    setParseResult(null);
    setParseError(null);
    const url = URL.createObjectURL(raw);
    setFile({ name: raw.name, type: raw.type, url });

    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", raw);
      const res = await fetch("/api/parse-floorplan", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setParseError(json.error ?? "An unexpected error occurred.");
      } else {
        setParseResult(json as ParsedFloorPlan);
      }
    } catch {
      setParseError("Network error — could not reach the server.");
    } finally {
      setParsing(false);
    }
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) process(dropped);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) process(picked);
  };

  const reset = () => {
    if (file) URL.revokeObjectURL(file.url);
    setFile(null);
    setError(null);
    setParseResult(null);
    setParseError(null);
    setParsing(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full max-w-2xl">
      {!file ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={[
            "flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-16 cursor-pointer transition-colors select-none",
            dragging
              ? "border-blue-500 bg-blue-50"
              : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100",
          ].join(" ")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
          <div className="text-center">
            <p className="text-base font-medium text-zinc-700">
              Drag &amp; drop your floor plan here
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              or <span className="text-blue-600 underline">click to browse</span>
            </p>
            <p className="mt-3 text-xs text-zinc-400">PNG or JPG — max 10 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={onChange}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="max-w-xs truncate text-sm font-medium text-zinc-700">{file.name}</p>
            <button
              onClick={reset}
              className="ml-4 rounded-full px-3 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            >
              Remove
            </button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.url}
            alt="Floor plan preview"
            className="w-full rounded-xl object-contain max-h-[480px] bg-zinc-50"
          />

          {parsing && (
            <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
              <svg
                className="animate-spin h-4 w-4 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Analysing floor plan…
            </div>
          )}

          {parseError && (
            <p className="mt-4 text-sm text-red-600">{parseError}</p>
          )}

          {parseResult && (
            <div className="mt-6 space-y-4">
              {parseResult.warnings.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                  <p className="mb-1 font-medium">Warnings</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    {parseResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-700">Rooms</h3>
                <div className="space-y-1.5">
                  {[...parseResult.rooms]
                    .sort((a, b) => {
                      const aKnown = a.approxWidthFt != null && a.approxLengthFt != null;
                      const bKnown = b.approxWidthFt != null && b.approxLengthFt != null;
                      if (aKnown && !bKnown) return -1;
                      if (!aKnown && bKnown) return 1;
                      return 0;
                    })
                    .map((room, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between rounded-lg bg-zinc-50 px-4 py-2 text-sm"
                      >
                        <div>
                          <span className="font-medium capitalize text-zinc-700">{room.name}</span>
                          {room.notes && (
                            <p className="mt-0.5 text-xs text-zinc-400">{room.notes}</p>
                          )}
                        </div>
                        <span className="ml-4 shrink-0 text-zinc-500">
                          {room.approxWidthFt != null && room.approxLengthFt != null
                            ? `${room.approxWidthFt} × ${room.approxLengthFt} ft`
                            : "dimensions unknown"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {parseResult.totalApproxSqFt != null && (
                <p className="text-sm text-zinc-600">
                  Total: ~{parseResult.totalApproxSqFt.toLocaleString()} sq ft
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-center text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
