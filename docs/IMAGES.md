# SeaweedFS Image Storage & Caching Strategy

PATA & CÃO uses **SeaweedFS** (https://github.com/seaweedfs/seaweedfs) for distributed, scalable image storage with intelligent caching.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Astro)                │
│              (Browser Cache + Service Worker)               │
└────────────────────────┬────────────────────────────────────┘
                         │ Requests: /api/images/{imageId}
┌────────────────────────▼────────────────────────────────────┐
│              Backend API (Golang + Echo)                    │
│          (Server Cache + Cache-Control Headers)             │
└────────────────────────┬────────────────────────────────────┘
                         │ Fetches: http://seaweedfs:8888/...
┌────────────────────────▼────────────────────────────────────┐
│           SeaweedFS (Distributed Object Storage)            │
│  Master (coordinator) + Volume Servers (replication)        │
│  Filer (directory structure) + S3 API Gateway               │
└─────────────────────────────────────────────────────────────┘
```

## SeaweedFS Components

- **Master**: Cluster coordinator, tracks volumes & replication
- **Volume Servers**: Store actual image data with replication
- **Filer**: Provides directory structure & metadata
- **S3 API Gateway**: S3-compatible endpoint for uploads/downloads
- **Replication**: Configurable (2-3x for high availability)

## Cache Layers

### Layer 1: Browser Cache (Client-Side)
- **Duration**: 30 days (configurable)
- **Headers**: `Cache-Control: public, max-age=2592000`
- **Storage**: LocalStorage for image metadata
- **Service Worker**: Pre-cache critical images (provider logos, default pet image)

### Layer 2: Server Cache (Backend)
- **Duration**: 7 days
- **Storage**: In-memory LRU cache + Redis (if available)
- **Keys**: Hashed by `imageId + version`
- **Strategy**: Lazy-load on first request, refresh on expiry

### Layer 3: CDN Cache (Future)
- **Duration**: 90 days
- **Provider**: CloudFlare or similar
- **Integration**: SeaweedFS S3 API endpoint as origin
- **Invalidation**: Manual via API endpoint `/api/admin/cache/invalidate`

## Image Storage Structure

```
SeaweedFS Filer:
/
├── /images/
│   ├── /partner-1/
│   │   ├── logo.jpg               # Partner logo (immutable)
│   │   ├── hero-banner.jpg        # Hero image
│   │   └── /gallery/
│   │       ├── facility-1.jpg
│   │       ├── facility-2.jpg
│   │       └── ...
│   ├── /partner-2/
│   │   └── ...
│   ├── /pets/
│   │   ├── /{petId}/
│   │   │   ├── photo-1.jpg
│   │   │   └── photo-2.jpg
│   └── /defaults/
│       ├── pet-placeholder.jpg    # Default pet image
│       ├── provider-placeholder.jpg
│       └── booking-error.jpg
└── /metadata/
    └── images.json                # Image manifest with versions & hashes
```

## Image Metadata Format

**Stored in SeaweedFS Filer metadata**:
```json
{
  "images": {
    "partner-1/logo": {
      "path": "/images/partner-1/logo.jpg",
      "fileId": "3,01abcd1234",
      "size": 45000,
      "hash": "abc123def456",
      "version": "1.0",
      "mimetype": "image/jpeg",
      "width": 200,
      "height": 100,
      "uploadedAt": "2026-05-01T10:00:00Z",
      "expiresAt": null,
      "cacheable": true,
      "cacheMaxAge": 2592000
    }
  }
}
```

## Backend Image Service

### Setup & Configuration

**backend/.env:**
```env
# SeaweedFS Configuration
SEAWEEDFS_MASTER_URL=http://seaweedfs-master:9333
SEAWEEDFS_VOLUME_URL=http://seaweedfs-volume:8080
SEAWEEDFS_FILER_URL=http://seaweedfs-filer:8888

# Alternatively, if using S3 gateway
SEAWEEDFS_S3_ENDPOINT=http://seaweedfs-s3:8333
SEAWEEDFS_S3_BUCKET=pata-cao-images
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# Replication factor
SEAWEEDFS_REPLICATION=2
```

### Endpoints

**1. Fetch Image**
```
GET /api/images/{imageId}
Headers:
  Cache-Control: public, max-age=2592000
  ETag: "abc123def456"
  Content-Type: image/jpeg
Body: Binary image data
```

**2. Get Image Metadata**
```
GET /api/images/{imageId}/metadata
Response:
{
  "id": "partner-1/logo",
  "url": "https://images.pata-cao.com/partner-1/logo",
  "seaweedfsFileId": "3,01abcd1234",
  "width": 200,
  "height": 100,
  "hash": "abc123def456",
  "cacheMaxAge": 2592000
}
```

**3. Upload Image** (Backend endpoint, or direct to S3)
```
POST /api/images/upload
Content-Type: multipart/form-data
Body: { image: File, type: "logo" }
```

**4. Invalidate Cache** (Admin only)
```
POST /api/admin/cache/invalidate
Body: { "imageIds": ["partner-1/logo"] }
```

### Implementation (Golang + Echo)

```go
package handler

import (
  "fmt"
  "io"
  "net/http"
  "time"

  "github.com/labstack/echo/v4"
  seaweedfs "github.com/seaweedfs/seaweedfs-client-go"
  "pata-cao/internal/cache"
  "pata-cao/internal/service"
)

type ImageHandler struct {
  imageService  service.ImageService
  seaweedClient *seaweedfs.Client
  cache         cache.Cache
}

// GetImage retrieves image with caching
func (h *ImageHandler) GetImage(c echo.Context) error {
  imageID := c.Param("imageId")

  // Check cache first
  if cachedImage, err := h.cache.Get(imageID); err == nil {
    c.Response().Header().Set("Cache-Control", "public, max-age=2592000")
    c.Response().Header().Set("X-Cache", "HIT")
    return c.Blob(http.StatusOK, "image/jpeg", cachedImage)
  }

  // Fetch from SeaweedFS
  metadata, err := h.imageService.GetImageMetadata(c.Request().Context(), imageID)
  if err != nil {
    return c.JSON(http.StatusNotFound, map[string]string{"error": "Image not found"})
  }

  // Download from SeaweedFS using file ID
  imageData, err := h.seaweedClient.DownloadFile(metadata.FileID)
  if err != nil {
    return c.JSON(http.StatusInternalServerError, 
      map[string]string{"error": "Failed to retrieve image"})
  }

  // Store in cache
  h.cache.Set(imageID, imageData, 7*24*time.Hour)

  // Set cache headers
  etag := fmt.Sprintf(`"%s"`, metadata.Hash)
  c.Response().Header().Set("Cache-Control", 
    fmt.Sprintf("public, max-age=%d", metadata.CacheMaxAge))
  c.Response().Header().Set("ETag", etag)
  c.Response().Header().Set("X-Cache", "MISS")
  c.Response().Header().Set("Last-Modified", metadata.UploadedAt.Format(http.TimeFormat))

  return c.Blob(http.StatusOK, metadata.MimeType, imageData)
}

// UploadImage handles image upload to SeaweedFS
func (h *ImageHandler) UploadImage(c echo.Context) error {
  imageType := c.Query("type")
  
  file, err := c.FormFile("image")
  if err != nil {
    return c.JSON(http.StatusBadRequest, 
      map[string]string{"error": "No file provided"})
  }

  src, err := file.Open()
  if err != nil {
    return c.JSON(http.StatusBadRequest, 
      map[string]string{"error": "Failed to open file"})
  }
  defer src.Close()

  // Upload to SeaweedFS
  fileID, url, size, err := h.seaweedClient.Upload(
    src,
    file.Filename,
    file.Header.Get("Content-Type"),
  )
  if err != nil {
    return c.JSON(http.StatusInternalServerError,
      map[string]string{"error": "Upload failed"})
  }

  return c.JSON(http.StatusOK, map[string]interface{}{
    "status": "uploaded",
    "imageId": file.Filename,
    "fileId": fileID,
    "url": url,
    "size": size,
  })
}
```

### SeaweedFS Client Setup (Go)

```go
package service

import (
  "io"
  seaweedfs "github.com/seaweedfs/seaweedfs-client-go"
)

func NewSeaweedFSClient(masterURL string) (*seaweedfs.Client, error) {
  client := seaweedfs.New(masterURL)
  return client, nil
}

// Example usage
client, err := NewSeaweedFSClient("http://seaweedfs-master:9333")

// Upload
fileID, url, size, err := client.Upload(
  file,
  "logo.jpg",
  "image/jpeg",
)

// Download
data, err := client.DownloadFile(fileID)

// Delete
err := client.DeleteFile(fileID)
```

## Cache Layers

### Layer 1: Browser Cache (Client-Side)
- **Duration**: 30 days (configurable)
- **Headers**: `Cache-Control: public, max-age=2592000`
- **Storage**: LocalStorage for image metadata
- **Service Worker**: Pre-cache critical images (provider logos, default pet image)

### Layer 2: Server Cache (Backend)
- **Duration**: 7 days
- **Storage**: In-memory LRU cache + Redis (if available)
- **Keys**: Hashed by `imageId + version`
- **Strategy**: Lazy-load on first request, refresh on expiry

### Layer 3: CDN Cache (Future)
- **Duration**: 90 days
- **Provider**: CloudFlare or similar
- **Invalidation**: Manual via API endpoint `/api/admin/cache/invalidate`

## Image Storage Structure

```
seaweedfs/
├── images/
│   ├── partner-1/
│   │   ├── logo.jpg               # Partner logo (immutable)
│   │   ├── hero-banner.jpg        # Hero image
│   │   └── gallery/
│   │       ├── facility-1.jpg
│   │       ├── facility-2.jpg
│   │       └── ...
│   ├── partner-2/
│   │   └── ...
│   └── defaults/
│       ├── pet-placeholder.jpg    # Default pet image
│       ├── provider-placeholder.jpg
│       └── booking-error.jpg
├── metadata.json                  # Image manifest with versions & hashes
└── README.md                       # Partner upload guidelines
```

## Image Metadata Format

**metadata.json** (in SeaweedFS Filer):
```json
{
  "images": {
    "partner-1/logo": {
      "path": "images/partner-1/logo.jpg",
      "size": 45000,
      "hash": "abc123def456",
      "version": "1.0",
      "mimetype": "image/jpeg",
      "width": 200,
      "height": 100,
      "uploadedAt": "2026-05-01T10:00:00Z",
      "expiresAt": null,
      "cacheable": true,
      "cacheMaxAge": 2592000
    }
  }
}
```

## Backend Image Service

### Endpoints

**1. Fetch Image**
```
GET /api/images/{imageId}
Headers:
  Cache-Control: public, max-age=2592000
  ETag: "abc123def456"
  Content-Type: image/jpeg
Body: Binary image data
```

**2. Get Image Metadata**
```
GET /api/images/{imageId}/metadata
Response:
{
  "id": "partner-1/logo",
  "url": "https://images.pata-cao.com/partner-1/logo",
  "width": 200,
  "height": 100,
  "hash": "abc123def456",
  "cacheMaxAge": 2592000
}
```

**3. Invalidate Cache** (Admin only)
```
POST /api/admin/cache/invalidate
Body: { "imageIds": ["partner-1/logo"] }
```

### Implementation (Golang + Echo)

```go
package handler

import (
  "crypto/md5"
  "fmt"
  "net/http"
  "time"
  
  "github.com/labstack/echo/v4"
  "pata-cao/internal/cache"
  "pata-cao/internal/service"
)

type ImageHandler struct {
  imageService service.ImageService
  cache        cache.Cache
}

// GetImage retrieves image with caching
func (h *ImageHandler) GetImage(c echo.Context) error {
  imageID := c.Param("imageId")
  
  // Check cache first
  if cachedImage, err := h.cache.Get(imageID); err == nil {
    c.Response().Header().Set("Cache-Control", "public, max-age=2592000")
    c.Response().Header().Set("X-Cache", "HIT")
    return c.Blob(http.StatusOK, "image/jpeg", cachedImage)
  }
  
  // Fetch from SeaweedFS
  imageData, metadata, err := h.imageService.FetchImage(c.Request().Context(), imageID)
  if err != nil {
    return c.JSON(http.StatusNotFound, map[string]string{"error": "Image not found"})
  }
  
  // Store in cache
  h.cache.Set(imageID, imageData, 7*24*time.Hour)
  
  // Set cache headers
  etag := fmt.Sprintf(`"%s"`, metadata.Hash)
  c.Response().Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", metadata.CacheMaxAge))
  c.Response().Header().Set("ETag", etag)
  c.Response().Header().Set("X-Cache", "MISS")
  c.Response().Header().Set("Last-Modified", metadata.UploadedAt.Format(http.TimeFormat))
  
  return c.Blob(http.StatusOK, metadata.MimeType, imageData)
}

// GetImageMetadata returns metadata without binary data
func (h *ImageHandler) GetImageMetadata(c echo.Context) error {
  imageID := c.Param("imageId")
  metadata, err := h.imageService.GetImageMetadata(c.Request().Context(), imageID)
  if err != nil {
    return c.JSON(http.StatusNotFound, map[string]string{"error": "Image not found"})
  }
  
  return c.JSON(http.StatusOK, metadata)
}

// InvalidateCache clears cache for specific images (admin only)
func (h *ImageHandler) InvalidateCache(c echo.Context) error {
  // Add admin authorization check
  req := struct {
    ImageIDs []string `json:"imageIds"`
  }{}
  
  if err := c.BindJSON(&req); err != nil {
    return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
  }
  
  for _, id := range req.ImageIDs {
    h.cache.Delete(id)
  }
  
  return c.JSON(http.StatusOK, map[string]string{"status": "Cache invalidated"})
}
```

## Frontend Image Component

### React Component with Lazy Loading

```typescript
import { useState, useEffect } from 'react';

interface ImageProps {
  imageId: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}

export function OptimizedImage({
  imageId,
  alt,
  width,
  height,
  className,
}: ImageProps) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImageMetadata = async () => {
      try {
        const response = await fetch(`/api/images/${imageId}/metadata`);
        if (!response.ok) throw new Error('Image not found');
        
        const metadata = await response.json();
        setImageUrl(metadata.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load image');
      } finally {
        setIsLoading(false);
      }
    };

    fetchImageMetadata();
  }, [imageId]);

  if (error) {
    return (
      <div className={`${className} bg-gray-200 flex items-center justify-center`}>
        <span className="text-gray-500">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading="lazy"
      decoding="async"
      onLoad={() => setIsLoading(false)}
    />
  );
}
```

### Service Worker for Image Pre-caching

```typescript
// public/sw.js
const CACHE_NAME = 'pata-cao-images-v1';
const CRITICAL_IMAGES = [
  '/api/images/defaults/pet-placeholder',
  '/api/images/defaults/provider-placeholder',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CRITICAL_IMAGES);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/images/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return (
          response ||
          fetch(event.request).then((response) => {
            const cache = caches.open(CACHE_NAME);
            cache.then((c) => c.put(event.request, response.clone()));
            return response;
          })
        );
      })
    );
  }
});
```

## Image Upload Guidelines for Partners

Partners can upload images via two methods:

### Method 1: Backend API (Recommended for Partners)
```bash
curl -X POST http://api.pata-cao.com/api/images/upload?type=logo \
  -F "image=@logo.png"
```

**Response:**
```json
{
  "status": "uploaded",
  "imageId": "partner-1/logo",
  "fileId": "3,01abcd1234",
  "url": "https://images.pata-cao.com/partner-1/logo",
  "size": 45000
}
```

### Method 2: Direct S3 Upload (For High Volume)
Use pre-signed URLs for direct uploads to SeaweedFS S3 gateway:

```typescript
// Frontend
const { signedUrl } = await fetch('/api/images/get-signed-url?path=partner-1/logo.jpg');
await fetch(signedUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'image/jpeg' },
});
```

## Supported Formats
- JPEG (.jpg, .jpeg) — Recommended for photos
- PNG (.png) — For logos with transparency
- WebP (.webp) — Future format (optional)

## Image Specifications by Type

### Partner Logo
- **Min Size**: 100x50px
- **Max Size**: 400x200px (recommended)
- **File Size**: 10KB–500KB (max 500KB)
- **Format**: PNG preferred (transparency support)
- **Naming**: `partner-{id}/logo.jpg` or `.png`
- **Aspect Ratio**: ~2:1 (width:height)

### Facility Photos (Gallery)
- **Min Size**: 600x400px
- **Max Size**: 2000x1500px (recommended)
- **File Size**: 100KB–5MB (max 5MB)
- **Format**: JPEG (optimized for web)
- **Naming**: `partner-{id}/gallery/facility-{n}.jpg`
- **Quality**: Must be clear, professional photos

### Pet Photos (User Uploads)
- **Min Size**: 200x200px
- **Max Size**: 4000x4000px
- **File Size**: 50KB–2MB (auto-compressed)
- **Format**: JPEG or PNG
- **Naming**: `pets/{petId}/{timestamp}.jpg`
- **Quality**: Any (will be auto-optimized)

## Upload Process

1. Upload images via the API or SeaweedFS S3 gateway
2. Update `metadata.json` with new entries
3. Include file hash (SHA256) and dimensions
4. All validations must pass (see below)
5. Await approval and merge
6. Cache auto-refreshes on next request

## Validation Rules (Checked on Upload)

### File Type Validation
✓ MIME type must match extension (no spoofing)
✓ PNG must have valid PNG header
✓ JPEG must have valid JPEG header
✓ No executable files, archives, or scripts

### Dimension Validation
✓ Width and height within specified ranges
✓ Aspect ratio reasonable (not extreme)
✓ Dimensions match declared values in metadata.json

### File Size Validation
✓ Total file size within max limits
✓ Uncompressed size reasonable (prevents memory bombs)
✓ No zero-byte files

### Security Checks
✓ No embedded metadata (EXIF data stripped)
✓ Image content matches declared purpose
✓ No suspicious binary data in file
```

## Validation Architecture

### Validation Layers

```
┌──────────────────────────────────────┐
│  Client-Side (Frontend)              │
│  - Pre-submit validation             │
│  - Fast feedback to user             │
│  - No security value (can be bypassed)│
└──────────────┬───────────────────────┘
               │ Upload
┌──────────────▼───────────────────────┐
│  Server-Side (Backend/API)           │
│  - File type & magic number check    │
│  - Dimensions & size validation      │
│  - EXIF data stripping               │
│  - Virus/malware scanning (optional) │
└──────────────┬───────────────────────┘
               │ Approval
┌──────────────▼───────────────────────┐
│  CI/CD (GitHub Actions)              │
│  - Batch validation pre-commit       │
│  - Image optimization check          │
│  - metadata.json consistency         │
│  - Linting & formatting              │
└──────────────────────────────────────┘
```

### Validation Specification per Image Type

```json
{
  "imageTypes": {
    "logo": {
      "formats": ["png", "jpg"],
      "minWidth": 100,
      "maxWidth": 400,
      "minHeight": 50,
      "maxHeight": 200,
      "maxFileSizeBytes": 524288,
      "aspectRatioMin": 1.5,
      "aspectRatioMax": 4.0,
      "stripExif": true,
      "requiresApproval": true
    },
    "facility-photo": {
      "formats": ["jpg"],
      "minWidth": 600,
      "maxWidth": 2000,
      "minHeight": 400,
      "maxHeight": 1500,
      "maxFileSizeBytes": 5242880,
      "aspectRatioMin": 1.0,
      "aspectRatioMax": 3.0,
      "stripExif": true,
      "requiresApproval": true
    },
    "pet-photo": {
      "formats": ["jpg", "png"],
      "minWidth": 200,
      "maxWidth": 4000,
      "minHeight": 200,
      "maxHeight": 4000,
      "maxFileSizeBytes": 2097152,
      "aspectRatioMin": 0.5,
      "aspectRatioMax": 2.0,
      "stripExif": true,
      "autoResize": true,
      "requiresApproval": false
    }
  }
}
```

## Server-Side Validation (Golang)

### Image Validation Service

```go
package service

import (
  "bytes"
  "fmt"
  "image"
  _ "image/gif"
  _ "image/jpeg"
  _ "image/png"
  "io"
  "mime"
  "os"
  "path/filepath"
)

type ImageValidation struct {
  MinWidth        int
  MaxWidth        int
  MinHeight       int
  MaxHeight       int
  MaxFileSizeBytes int64
  AllowedFormats  []string
  AspectRatioMin  float32
  AspectRatioMax  float32
}

type ImageValidationError struct {
  Field   string
  Message string
}

// ValidateImage checks file type, dimensions, and size
func ValidateImage(
  filePath string,
  config ImageValidation,
) ([]ImageValidationError, error) {
  var errors []ImageValidationError

  // 1. Check file exists
  fileInfo, err := os.Stat(filePath)
  if err != nil {
    return nil, fmt.Errorf("file not found: %w", err)
  }

  // 2. Validate file size
  if fileInfo.Size() > config.MaxFileSizeBytes {
    errors = append(errors, ImageValidationError{
      Field:   "fileSize",
      Message: fmt.Sprintf("File too large: %d bytes (max %d)", 
        fileInfo.Size(), config.MaxFileSizeBytes),
    })
  }

  if fileInfo.Size() == 0 {
    errors = append(errors, ImageValidationError{
      Field:   "fileSize",
      Message: "File is empty",
    })
  }

  // 3. Validate file type
  ext := strings.ToLower(filepath.Ext(filePath))
  if !contains(config.AllowedFormats, ext) {
    errors = append(errors, ImageValidationError{
      Field:   "format",
      Message: fmt.Sprintf("Invalid format: %s. Allowed: %v", 
        ext, config.AllowedFormats),
    })
  }

  // 4. Verify MIME type matches extension (prevent spoofing)
  file, err := os.Open(filePath)
  if err != nil {
    return nil, err
  }
  defer file.Close()

  buffer := make([]byte, 512)
  _, err = file.Read(buffer)
  if err != nil && err != io.EOF {
    return nil, err
  }

  mimeType := mime.TypeByExtension(ext)
  detectedMimeType := http.DetectContentType(buffer)

  if !isCompatibleMimeType(detectedMimeType, mimeType) {
    errors = append(errors, ImageValidationError{
      Field:   "mimeType",
      Message: fmt.Sprintf("MIME type mismatch: detected %s, expected %s",
        detectedMimeType, mimeType),
    })
  }

  // 5. Validate dimensions
  file.Seek(0, 0)
  config, format, err := image.DecodeConfig(file)
  if err != nil {
    errors = append(errors, ImageValidationError{
      Field:   "dimensions",
      Message: fmt.Sprintf("Could not read image dimensions: %v", err),
    })
    return errors, nil // Can't validate further without dimensions
  }

  width := config.Width
  height := config.Height

  if width < config.MinWidth || width > config.MaxWidth {
    errors = append(errors, ImageValidationError{
      Field:   "width",
      Message: fmt.Sprintf("Width %d out of range [%d, %d]",
        width, config.MinWidth, config.MaxWidth),
    })
  }

  if height < config.MinHeight || height > config.MaxHeight {
    errors = append(errors, ImageValidationError{
      Field:   "height",
      Message: fmt.Sprintf("Height %d out of range [%d, %d]",
        height, config.MinHeight, config.MaxHeight),
    })
  }

  // 6. Validate aspect ratio
  aspectRatio := float32(width) / float32(height)
  if aspectRatio < config.AspectRatioMin || aspectRatio > config.AspectRatioMax {
    errors = append(errors, ImageValidationError{
      Field:   "aspectRatio",
      Message: fmt.Sprintf("Aspect ratio %.2f out of range [%.2f, %.2f]",
        aspectRatio, config.AspectRatioMin, config.AspectRatioMax),
    })
  }

  return errors, nil
}

// Helper functions
func contains(slice []string, item string) bool {
  for _, v := range slice {
    if v == item {
      return true
    }
  }
  return false
}

func isCompatibleMimeType(detected, expected string) bool {
  // Allow some flexibility (jpeg variants)
  acceptableTypes := map[string][]string{
    "image/jpeg": {"image/jpeg", "image/jpg"},
    "image/jpg":  {"image/jpeg", "image/jpg"},
    "image/png":  {"image/png"},
    "image/webp": {"image/webp"},
  }
  
  accepted := acceptableTypes[expected]
  for _, t := range accepted {
    if detected == t {
      return true
    }
  }
  return false
}
```

### API Endpoint with Validation

```go
// POST /api/images/upload
func (h *ImageHandler) UploadImage(c echo.Context) error {
  imageType := c.Query("type") // "logo", "facility-photo", "pet-photo"
  
  // Get validation config for image type
  config, exists := h.validationConfigs[imageType]
  if !exists {
    return c.JSON(http.StatusBadRequest, 
      map[string]string{"error": "Invalid image type"})
  }

  // Receive file
  file, err := c.FormFile("image")
  if err != nil {
    return c.JSON(http.StatusBadRequest, 
      map[string]string{"error": "No file provided"})
  }

  // Save temporarily
  tmpPath := filepath.Join("/tmp", file.Filename)
  if err := c.SaveUploadedFile(file, tmpPath); err != nil {
    return c.JSON(http.StatusInternalServerError,
      map[string]string{"error": "Failed to save file"})
  }
  defer os.Remove(tmpPath)

  // Validate
  validationErrors, err := h.imageService.ValidateImage(tmpPath, config)
  if err != nil {
    return c.JSON(http.StatusInternalServerError,
      map[string]string{"error": err.Error()})
  }

  if len(validationErrors) > 0 {
    return c.JSON(http.StatusBadRequest,
      map[string]interface{}{
        "status": "validation_failed",
        "errors": validationErrors,
      })
  }

  // Image passed validation
  // Save to SeaweedFS (or local staging for approval)
  savedPath := filepath.Join(h.imageStoragePath, file.Filename)
  if err := copyFile(tmpPath, savedPath); err != nil {
    return c.JSON(http.StatusInternalServerError,
      map[string]string{"error": "Failed to store image"})
  }

  return c.JSON(http.StatusOK, map[string]interface{}{
    "status":   "uploaded",
    "imageId":  file.Filename,
    "requires_approval": config.RequiresApproval,
  })
}
```

## Client-Side Validation (React)

### Image Upload Component with Pre-validation

```typescript
import { useState } from 'react';

interface ImageUploadProps {
  imageType: 'logo' | 'facility-photo' | 'pet-photo';
  onUpload: (file: File) => void;
}

const VALIDATION_CONFIG = {
  logo: {
    formats: ['image/png', 'image/jpeg'],
    maxSizeBytes: 524288, // 500KB
    minWidth: 100,
    maxWidth: 400,
    minHeight: 50,
    maxHeight: 200,
  },
  'facility-photo': {
    formats: ['image/jpeg'],
    maxSizeBytes: 5242880, // 5MB
    minWidth: 600,
    maxWidth: 2000,
    minHeight: 400,
    maxHeight: 1500,
  },
  'pet-photo': {
    formats: ['image/jpeg', 'image/png'],
    maxSizeBytes: 2097152, // 2MB
    minWidth: 200,
    maxWidth: 4000,
    minHeight: 200,
    maxHeight: 4000,
  },
};

export function ImageUpload({ imageType, onUpload }: ImageUploadProps) {
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const config = VALIDATION_CONFIG[imageType];

  const validateFile = (file: File): string[] => {
    const errors: string[] = [];

    // 1. Check MIME type
    if (!config.formats.includes(file.type)) {
      errors.push(
        `Invalid format: ${file.type}. Allowed: ${config.formats.join(', ')}`
      );
    }

    // 2. Check file size
    if (file.size > config.maxSizeBytes) {
      errors.push(
        `File too large: ${(file.size / 1024).toFixed(2)}KB (max ${(config.maxSizeBytes / 1024).toFixed(2)}KB)`
      );
    }

    return errors;
  };

  const validateDimensions = (
    file: File,
    config: typeof VALIDATION_CONFIG['logo']
  ): Promise<string[]> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const dimensionErrors: string[] = [];

          if (img.width < config.minWidth || img.width > config.maxWidth) {
            dimensionErrors.push(
              `Width ${img.width}px out of range [${config.minWidth}, ${config.maxWidth}]`
            );
          }

          if (img.height < config.minHeight || img.height > config.maxHeight) {
            dimensionErrors.push(
              `Height ${img.height}px out of range [${config.minHeight}, ${config.maxHeight}]`
            );
          }

          resolve(dimensionErrors);
        };
        
        img.onerror = () => {
          resolve(['Could not read image dimensions']);
        };
        
        img.src = e.target?.result as string;
      };

      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrors([]);

    // 1. Quick validation
    const quickErrors = validateFile(file);
    if (quickErrors.length > 0) {
      setErrors(quickErrors);
      setLoading(false);
      return;
    }

    // 2. Dimension validation
    const dimensionErrors = await validateDimensions(file, config);
    if (dimensionErrors.length > 0) {
      setErrors(dimensionErrors);
      setLoading(false);
      return;
    }

    // 3. All checks passed
    setLoading(false);
    onUpload(file);
  };

  return (
    <div>
      <input
        type="file"
        accept={VALIDATION_CONFIG[imageType].formats.join(',')}
        onChange={handleFileChange}
        disabled={loading}
      />
      
      {errors.length > 0 && (
        <div className="error-list">
          {errors.map((error, i) => (
            <div key={i} className="error-item">
              ❌ {error}
            </div>
          ))}
        </div>
      )}

      {loading && <div>Validating image...</div>}
    </div>
  );
}
```

## CI/CD Validation (GitHub Actions)

### Pre-commit Hook for Local Validation

**.git/hooks/pre-commit** (in SeaweedFS image repo):

```bash
#!/bin/bash
set -e

# Validate images before commit
npm run validate:images

echo "✓ All images passed validation"
```

### GitHub Actions Workflow

**.github/workflows/validate-images.yml** (in SeaweedFS image repo):

```yaml
name: Validate Images

on:
  pull_request:
    paths:
      - 'images/**'
      - 'images/metadata.json'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install sharp imagemin imagemin-mozjpeg
      
      - name: Validate image dimensions
        run: npm run validate:dimensions
      
      - name: Validate file sizes
        run: npm run validate:sizes
      
      - name: Validate MIME types
        run: npm run validate:mimes
      
      - name: Optimize images (lossless)
        run: npm run optimize:images
      
      - name: Validate metadata.json
        run: npm run validate:metadata
      
      - name: Check for EXIF data
        run: npm run strip:exif
```

### Validation Script (Node.js)

**scripts/validate-images.js** (in SeaweedFS image repo):

```javascript
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const VALIDATION_RULES = require('./image-validation-config.json');

async function validateImage(filePath, imageType) {
  const rules = VALIDATION_RULES[imageType];
  const errors = [];

  // Check file size
  const stats = fs.statSync(filePath);
  if (stats.size > rules.maxFileSizeBytes) {
    errors.push(
      `File size ${stats.size} exceeds max ${rules.maxFileSizeBytes}`
    );
  }

  // Check dimensions
  try {
    const metadata = await sharp(filePath).metadata();
    
    if (metadata.width < rules.minWidth || metadata.width > rules.maxWidth) {
      errors.push(
        `Width ${metadata.width} out of range [${rules.minWidth}, ${rules.maxWidth}]`
      );
    }

    if (metadata.height < rules.minHeight || metadata.height > rules.maxHeight) {
      errors.push(
        `Height ${metadata.height} out of range [${rules.minHeight}, ${rules.maxHeight}]`
      );
    }

    // Check aspect ratio
    const aspectRatio = metadata.width / metadata.height;
    if (
      aspectRatio < rules.aspectRatioMin ||
      aspectRatio > rules.aspectRatioMax
    ) {
      errors.push(
        `Aspect ratio ${aspectRatio.toFixed(2)} out of range [${rules.aspectRatioMin}, ${rules.aspectRatioMax}]`
      );
    }

    // Strip EXIF data
    if (rules.stripExif) {
      await sharp(filePath).withMetadata(false).toFile(filePath + '.clean');
      fs.renameSync(filePath + '.clean', filePath);
    }
  } catch (err) {
    errors.push(`Could not read image: ${err.message}`);
  }

  return errors;
}

async function validateAllImages() {
  const imagesDir = path.join(__dirname, '../images');
  let totalErrors = 0;

  // Walk through all images
  const walk = async (dir) => {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        await walk(filePath);
      } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file).toLowerCase())) {
        // Determine image type from path
        const relPath = path.relative(imagesDir, filePath);
        let imageType = 'facility-photo'; // default

        if (relPath.includes('logo')) imageType = 'logo';
        if (relPath.includes('pet')) imageType = 'pet-photo';

        const errors = await validateImage(filePath, imageType);
        if (errors.length > 0) {
          console.error(`❌ ${relPath}:`);
          errors.forEach(err => console.error(`   - ${err}`));
          totalErrors += errors.length;
        } else {
          console.log(`✓ ${relPath}`);
        }
      }
    }
  };

  await walk(imagesDir);

  if (totalErrors > 0) {
    console.error(`\n❌ Validation failed with ${totalErrors} error(s)`);
    process.exit(1);
  } else {
    console.log('\n✓ All images passed validation');
  }
}

validateAllImages();
```

---

## Configuration

**Backend .env:**
```env
# Image storage
IMAGE_STORAGE_TYPE=seaweedfs
IMAGE_STORAGE_URL=https://raw.githubusercontent.com/seaweedfs/seaweedfs/main
IMAGE_METADATA_PATH=images/metadata.json

# Caching
IMAGE_CACHE_ENABLED=true
IMAGE_CACHE_MAX_SIZE=1000
IMAGE_CACHE_TTL=604800  # 7 days in seconds

# CDN (optional)
CDN_ENABLED=false
CDN_URL=https://cdn.pata-cao.com
CDN_INVALIDATION_KEY=your-key-here
```

## Performance Optimization

### 1. Image Compression
- Use `imagemin` during CI to compress images before merge
- Target: <100KB for logos, <500KB for photos

### 2. Responsive Images
```html
<picture>
  <source srcset="/api/images/partner-1/logo?w=400 1x, /api/images/partner-1/logo?w=800 2x" />
  <img src="/api/images/partner-1/logo" alt="Partner Logo" />
</picture>
```

### 3. Lazy Loading
- Use `loading="lazy"` on all images below fold
- Pre-load critical images in Service Worker

### 4. Image Versioning
- Include image hash in URL for cache busting: `/api/images/partner-1/logo?v=abc123def456`

## Monitoring & Debugging

```bash
# Check cache hit/miss rate
curl -I https://api.pata-cao.com/api/images/partner-1/logo
# Look for X-Cache: HIT or MISS header

# Monitor image size
ls -lh seaweedfs/images/**/*.jpg | awk '{sum += $5} END {print "Total: " sum " bytes"}'

# Verify metadata consistency
jq '.images | length' seaweedfs/images/metadata.json
```

## Security Considerations

1. **Image Validation**: Verify file type & dimensions server-side
2. **Access Control**: No direct SeaweedFS URL exposure (always through API)
3. **Rate Limiting**: Apply rate limits to image endpoints
4. **Hotlinking Prevention**: Referrer header validation
5. **Expiry**: Old images removed after 1 year (configurable)

---

**Last Updated**: 2026-05-02
