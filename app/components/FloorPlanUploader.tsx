"use client";

import { useCallback, useRef, useState } from "react";

type UploadedFile = {
  name: string;
  type: string;
  url: string;
};

const ACCEPTED = ["image/png", "image/jpeg", "application/pdf"];
const ACCEPT_ATTR = ".png,.jpg,.jpeg,.pdf";

export default function FloorPlanUploader() {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = useCallback((raw: File) => {
    if (!ACCEPTED.includes(raw.type)) {
      setError("Only PNG, JPG, and PDF files are supported.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(raw);
    setFile({ name: raw.name, type: raw.type, url });
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
    if (inputRef.current) inputRef.current.value = "";
  };

  const isImage = file && (file.type === "image/png" || file.type === "image/jpeg");

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
            <p className="mt-3 text-xs text-zinc-400">PNG, JPG, or PDF — max 20 MB</p>
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
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url}
              alt="Floor plan preview"
              className="w-full rounded-xl object-contain max-h-[480px] bg-zinc-50"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-zinc-50 py-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              <p className="text-sm font-medium text-zinc-600">PDF uploaded</p>
              <p className="text-xs text-zinc-400">{file.name}</p>
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
