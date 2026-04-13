"use client";

import { useRouter } from "next/navigation";

export default function UnauthorizedView() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-800">Access Denied</h1>
        <p className="text-gray-600">
          You are not authorized to view this data.
        </p>
        <button
          className="btn-primary-action rounded-2xl justify-center"
          onClick={() => router.push("/documents")}
        >
          Take me back to my hours of service
        </button>
      </div>
    </div>
  );
}
