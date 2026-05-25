const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const UPLOADS_DIR = path.join(__dirname, "..", "assets", "uploads");
const BUCKET = "paf-uploads";
const MAX_BYTES = 5 * 1024 * 1024;

function safeFilename(name) {
  const base = path.basename(name || "image.jpg").replace(/[^\w.\-]+/g, "-");
  return base.slice(0, 80) || "image.jpg";
}

function ensureLocalUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

async function ensureStorageBucket(supabase) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET || b.id === BUCKET)) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

async function uploadToSupabase(file) {
  const { createClient } = require("@supabase/supabase-js");
  const url =
    process.env.SUPABASE_URL ||
    "https://wxubwrjdtylnpvjtogjp.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await ensureStorageBucket(supabase);

  const ext = path.extname(safeFilename(file.originalname)) || ".jpg";
  const storagePath = `projects/${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

function uploadToLocal(file) {
  ensureLocalUploadsDir();
  const ext = path.extname(safeFilename(file.originalname)) || ".jpg";
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  const fullPath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(fullPath, file.buffer);
  return `/assets/uploads/${filename}`;
}

async function saveUploadedImage(file) {
  if (!file?.buffer?.length) {
    throw new Error("Archivo vacío");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("La imagen no puede superar 5 MB");
  }
  if (!file.mimetype?.startsWith("image/")) {
    throw new Error("Solo se permiten archivos de imagen");
  }

  if (db.useSupabase()) {
    return uploadToSupabase(file);
  }
  return uploadToLocal(file);
}

module.exports = { saveUploadedImage, MAX_BYTES };
