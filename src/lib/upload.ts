import { supabase } from "@/integrations/supabase/client";

export async function uploadAnexo(file: File, folder = "geral"): Promise<string> {
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
