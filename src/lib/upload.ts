import { supabase } from "@/integrations/supabase/client";

/** Limite global de upload por arquivo (2 MB) — evita sobrecarga do sistema. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "2 MB";

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Lança erro se o arquivo exceder o limite global. */
export function assertFileSizeOk(file: File): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Arquivo "${file.name}" (${formatFileSize(file.size)}) excede o limite de ${MAX_UPLOAD_LABEL} por arquivo.`,
    );
  }
}

export async function uploadAnexo(file: File, folder = "geral"): Promise<string> {
  assertFileSizeOk(file);
  const ext = file.name.split(".").pop();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("anexos").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function getAnexoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
