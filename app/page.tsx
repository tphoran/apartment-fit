import FloorPlanUploader from "./components/FloorPlanUploader";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">apartment fit</h1>
        <p className="mt-2 text-zinc-500">Upload a floor plan to get started</p>
      </div>
      <FloorPlanUploader />
    </main>
  );
}
