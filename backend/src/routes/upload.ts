import { Hono } from "hono";

interface StorageFile {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
}

interface StorageResponse {
  file: StorageFile;
}

interface StorageError {
  error?: string;
}

export const uploadRouter = new Hono();

// Upload file to Vibecode storage
uploadRouter.post("/", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Forward to Vibecode storage service
    const storageForm = new FormData();
    storageForm.append("file", file);

    const response = await fetch("https://storage.vibecodeapp.com/v1/files/upload", {
      method: "POST",
      body: storageForm,
    });

    if (!response.ok) {
      const errorData = (await response.json()) as StorageError;
      console.error("[Upload] Storage error:", errorData);
      return c.json({ error: errorData.error || "Upload failed" }, 500);
    }

    const result = (await response.json()) as StorageResponse;
    console.log("[Upload] File uploaded successfully:", result.file?.url);

    return c.json({
      data: {
        id: result.file.id,
        url: result.file.url,
        filename: result.file.originalFilename,
        contentType: result.file.contentType,
        sizeBytes: result.file.sizeBytes,
      }
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return c.json({ error: "Upload failed" }, 500);
  }
});

// Delete file from Vibecode storage
uploadRouter.delete("/:id", async (c) => {
  try {
    const { id } = c.req.param();

    const response = await fetch(`https://storage.vibecodeapp.com/v1/files/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      return c.json({ error: "Delete failed" }, 500);
    }

    return c.json({ data: { success: true } });
  } catch (error) {
    console.error("[Upload] Delete error:", error);
    return c.json({ error: "Delete failed" }, 500);
  }
});
