type GroupLogoUploadProps = {
  value: File | null;
  onChange: (file: File | null) => void;
};

export function GroupLogoUpload({ value, onChange }: GroupLogoUploadProps) {
  return (
    <label className="card-setting logo-upload-setting">
      <span>Upload logo kelompok (opsional)</span>
      <input
        className="logo-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload logo kelompok"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <small>{value ? value.name : "JPG, PNG, atau WebP · maksimal 5 MB"}</small>
    </label>
  );
}
