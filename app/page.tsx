import FloorPlanUploader from "./components/FloorPlanUploader";
import FurnitureUrlInput from "./components/FurnitureUrlInput";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">apartment fit</h1>
        <p className="mt-2 text-zinc-500">Upload a floor plan to get started</p>
      </div>
      <FloorPlanUploader />
      <div className="w-full max-w-2xl">
        <hr className="my-8 border-zinc-200" />
        <h2 className="mb-4 text-lg font-semibold text-zinc-700">Add furniture</h2>
        <FurnitureUrlInput />
      </div>
    </main>
  );
}
