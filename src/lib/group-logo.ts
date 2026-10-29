import { supabase } from "@/lib/supabase";

export const GROUP_LOGO_BUCKET = "group-logos";
const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadGroupLogo(file: File) {
  if (!supabase) throw new Error("Supabase belum terkonfigurasi.");
  const extension = EXTENSIONS[file.type];
  if (!extension) throw new Error("Logo harus berupa JPG, PNG, atau WebP.");
  if (file.size > MAX_LOGO_SIZE) throw new Error("Ukuran logo maksimal 5 MB.");

  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(GROUP_LOGO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Logo gagal diunggah: ${error.message}`);

  const { data } = supabase.storage.from(GROUP_LOGO_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function removeGroupLogo(path: string) {
  if (!supabase) return;
  await supabase.storage.from(GROUP_LOGO_BUCKET).remove([path]);
}
