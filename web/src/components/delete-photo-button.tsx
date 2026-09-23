"use client";

export function DeletePhotoButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="text-sm text-red-600 underline"
      onClick={(event) => {
        if (!window.confirm(`ลบรูป "${label}" ออก?`)) {
          event.preventDefault();
        }
      }}
    >
      ลบรูป
    </button>
  );
}
