# Image Validation Checklist

Complete validation strategy for all image uploads in PATA & CÃO.

## Pre-Upload (Client-Side) Validation

Use these checks for **immediate feedback** to users. ⚠️ Not security-critical (can be bypassed).

- [ ] File selected (not null)
- [ ] File size < max (show size in MB)
- [ ] File MIME type in allowed list (image/jpeg, image/png, etc.)
- [ ] Image loads successfully (can read dimensions)
- [ ] Image width in [min, max] range
- [ ] Image height in [min, max] range
- [ ] Aspect ratio in [min, max] range
- [ ] Show all validation errors in user-friendly format
- [ ] Disable submit button until all validations pass
- [ ] Show progress indicator while checking dimensions

## Upload & Server Validation (Backend)

**REQUIRED security checks**. Server must reject invalid uploads.

### File Type Validation
```go
✓ Verify MIME type from Content-Type header
✓ Read magic number (file header bytes)
✓ Verify magic number matches declared format:
  - JPEG: FF D8 FF
  - PNG: 89 50 4E 47
  - WebP: RIFF ... WEBP
✓ Reject if extension doesn't match magic number (prevent spoofing)
✓ Reject if MIME type is text/*, application/*, etc.
```

### File Size Validation
```go
✓ Reject if size == 0 (empty file)
✓ Reject if size > max_file_size_bytes
✓ Log file size for monitoring
✓ Return 413 (Payload Too Large) if exceeded
```

### Image Dimension Validation
```go
✓ Attempt to decode image (catch corrupt files)
✓ Extract width & height from image metadata
✓ Verify width in [min_width, max_width]
✓ Verify height in [min_height, max_height]
✓ Calculate aspect ratio: width / height
✓ Verify aspect_ratio in [min_ratio, max_ratio]
✓ Reject if any dimension validation fails (400 Bad Request)
```

### Security Checks
```go
✓ Strip all EXIF metadata (privacy)
✓ Remove embedded ICC profiles
✓ Verify image content matches declared purpose (visual inspection)
✓ Run basic malware scan if available (ClamAV)
✓ Verify uncompressed size is reasonable (prevent decompression bombs)
```

### API Response
```json
// ✅ Valid image
HTTP 200 OK
{
  "status": "uploaded",
  "imageId": "partner-1/logo.png",
  "url": "https://api.pata-cao.com/api/images/partner-1/logo",
  "dimensions": { "width": 300, "height": 150 },
  "fileSize": 45000,
  "hash": "abc123def456"
}

// ❌ Invalid image
HTTP 400 Bad Request
{
  "status": "validation_failed",
  "errors": [
    {
      "field": "width",
      "message": "Width 150px out of range [100, 400]"
    },
    {
      "field": "fileSize",
      "message": "File 2.5MB exceeds max 500KB"
    }
  ]
}
```

## CI/CD Validation (GitHub Actions)

Run before merge to rustfs. Validates all changed images.

- [ ] File size validation for all images
- [ ] Dimension validation for all images
- [ ] MIME type validation
- [ ] Magic number validation (no spoofing)
- [ ] EXIF data check (should be stripped)
- [ ] metadata.json consistency (all keys match files)
- [ ] Image hash verification (matches declared value)
- [ ] Compression check (images should be optimized)
- [ ] No duplicate images (by hash)
- [ ] File naming conventions followed
- [ ] Create detailed validation report on PR

## Per-Image-Type Validation Matrix

### Partner Logo
```
Type: PNG or JPEG
┌─────────────────────────────────────┐
│ Min Size    │ 100x50 px             │
│ Max Size    │ 400x200 px            │
│ Max File    │ 500 KB                │
│ Aspect Ratio│ 1.5 : 1 to 4.0 : 1    │
│ Purpose     │ Brand logo            │
│ Quality     │ Must be professional  │
└─────────────────────────────────────┘
```

### Facility Photo
```
Type: JPEG (recommended)
┌─────────────────────────────────────┐
│ Min Size    │ 600x400 px            │
│ Max Size    │ 2000x1500 px          │
│ Max File    │ 5 MB                  │
│ Aspect Ratio│ 1.0 : 1 to 3.0 : 1    │
│ Purpose     │ Facility/service photo│
│ Quality     │ Clear, professional   │
└─────────────────────────────────────┘
```

### Pet Photo (User Upload)
```
Type: JPEG or PNG
┌─────────────────────────────────────┐
│ Min Size    │ 200x200 px            │
│ Max Size    │ 4000x4000 px          │
│ Max File    │ 2 MB                  │
│ Aspect Ratio│ 0.5 : 1 to 2.0 : 1    │
│ Purpose     │ User's pet photo      │
│ Quality     │ Any (auto-optimized)  │
└─────────────────────────────────────┘
Auto-resize to max 1200x1200px after upload.
```

## Error Messages (User-Friendly)

### File Size Errors
```
❌ File too large (2.5 MB). Max allowed: 500 KB
   💡 Compress your image using an online tool or Photoshop
```

### Dimension Errors
```
❌ Image too small (150 x 100 px). Min required: 200 x 200 px
   💡 Use an image at least 200 pixels wide and tall
```

### Format Errors
```
❌ Invalid format: .gif. Allowed: PNG, JPEG
   💡 Save your image as PNG or JPEG and try again
```

### Aspect Ratio Errors
```
❌ Image proportions incorrect. Expected ~2:1, got 1:1
   💡 Logo should be roughly twice as wide as it is tall
```

### Server Error
```
❌ Upload failed. Please try again.
   💡 If the problem persists, contact support@pata-cao.com
```

## Testing Validation

### Test Cases

**Valid Uploads**:
- ✅ Logo at min size (100x50) → Accepts
- ✅ Logo at max size (400x200) → Accepts
- ✅ Logo at recommended size (300x150) → Accepts
- ✅ Facility photo at min size (600x400) → Accepts

**Invalid Format**:
- ❌ GIF file → Rejects "Invalid format"
- ❌ .jpg with fake PNG header → Rejects "MIME type mismatch"
- ❌ Text file renamed to .jpg → Rejects "Invalid JPEG header"

**Invalid Size**:
- ❌ Empty file (0 bytes) → Rejects "File is empty"
- ❌ Logo > 500 KB → Rejects "File too large"
- ❌ Facility photo > 5 MB → Rejects "File too large"

**Invalid Dimensions**:
- ❌ Logo 50x50 (below min) → Rejects "Width too small"
- ❌ Logo 500x200 (above max width) → Rejects "Width too large"
- ❌ Logo 100x300 (bad aspect ratio) → Rejects "Aspect ratio incorrect"

### Automated Test Script

```bash
#!/bin/bash
# test-image-validation.sh

# Generate test images
convert -size 100x50 xc:red logo-small.jpg
convert -size 400x200 xc:red logo-correct.jpg
convert -size 500x200 xc:red logo-large.jpg
convert -size 50x50 xc:red logo-tiny.jpg

# Test uploads
echo "Testing VALID logo (correct size)..."
curl -F "image=@logo-correct.jpg" \
  http://localhost:8080/api/images/upload?type=logo
# Expected: 200 OK

echo "Testing INVALID logo (too small)..."
curl -F "image=@logo-tiny.jpg" \
  http://localhost:8080/api/images/upload?type=logo
# Expected: 400 Bad Request

echo "Testing INVALID logo (too large)..."
curl -F "image=@logo-large.jpg" \
  http://localhost:8080/api/images/upload?type=logo
# Expected: 400 Bad Request
```

## Monitoring & Alerts

Track validation metrics:

```
Metrics to log:
- total_uploads_attempted
- uploads_passed_validation
- uploads_failed_validation
- top_5_validation_failures (by error type)
- average_file_size_by_type
- average_dimensions_by_type

Alert if:
- validation_failure_rate > 20% (indicates user confusion)
- client_dimension_check_failures spike (might be bug)
- EXIF_data_still_present > 0 (stripping not working)
```

---

**Last Updated**: 2026-05-02
