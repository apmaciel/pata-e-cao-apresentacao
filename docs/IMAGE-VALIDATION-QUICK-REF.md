# Image Validation - Quick Reference

Copy-paste ready validation code for common scenarios.

## Validation Config Template

```go
// internal/config/image_validation.go
package config

type ImageValidationConfig struct {
  MinWidth        int
  MaxWidth        int
  MinHeight       int
  MaxHeight       int
  MaxFileSizeBytes int64
  AllowedFormats  []string
  AspectRatioMin  float32
  AspectRatioMax  float32
  StripExif       bool
  RequiresApproval bool
}

var ImageValidationRules = map[string]ImageValidationConfig{
  "logo": {
    MinWidth:         100,
    MaxWidth:         400,
    MinHeight:        50,
    MaxHeight:        200,
    MaxFileSizeBytes: 524288, // 500KB
    AllowedFormats:   []string{".jpg", ".jpeg", ".png"},
    AspectRatioMin:   1.5,
    AspectRatioMax:   4.0,
    StripExif:        true,
    RequiresApproval: true,
  },
  "facility-photo": {
    MinWidth:         600,
    MaxWidth:         2000,
    MinHeight:        400,
    MaxHeight:        1500,
    MaxFileSizeBytes: 5242880, // 5MB
    AllowedFormats:   []string{".jpg", ".jpeg"},
    AspectRatioMin:   1.0,
    AspectRatioMax:   3.0,
    StripExif:        true,
    RequiresApproval: true,
  },
  "pet-photo": {
    MinWidth:         200,
    MaxWidth:         4000,
    MinHeight:        200,
    MaxHeight:        4000,
    MaxFileSizeBytes: 2097152, // 2MB
    AllowedFormats:   []string{".jpg", ".jpeg", ".png"},
    AspectRatioMin:   0.5,
    AspectRatioMax:   2.0,
    StripExif:        true,
    RequiresApproval: false,
  },
}
```

## Backend Validation (Golang)

### Simple Validation Function

```go
package service

import (
  "fmt"
  "image"
  _ "image/jpeg"
  _ "image/png"
  "net/http"
  "os"
  "path/filepath"
)

type ValidationError struct {
  Field   string `json:"field"`
  Message string `json:"message"`
}

func ValidateImageFile(
  filePath string,
  config ImageValidationConfig,
) []ValidationError {
  var errors []ValidationError

  // 1. File size
  fileInfo, _ := os.Stat(filePath)
  if fileInfo.Size() > config.MaxFileSizeBytes {
    errors = append(errors, ValidationError{
      Field:   "fileSize",
      Message: fmt.Sprintf("Max size %d KB exceeded", config.MaxFileSizeBytes/1024),
    })
  }

  // 2. File type from magic number
  file, _ := os.Open(filePath)
  defer file.Close()

  buffer := make([]byte, 512)
  file.Read(buffer)

  mimeType := http.DetectContentType(buffer)
  if !isValidMimeType(mimeType) {
    errors = append(errors, ValidationError{
      Field:   "format",
      Message: "Invalid image format",
    })
    return errors
  }

  // 3. Dimensions
  file.Seek(0, 0)
  cfg, _, _ := image.DecodeConfig(file)

  if cfg.Width < config.MinWidth {
    errors = append(errors, ValidationError{
      Field:   "width",
      Message: fmt.Sprintf("Min width %d px required", config.MinWidth),
    })
  }
  if cfg.Width > config.MaxWidth {
    errors = append(errors, ValidationError{
      Field:   "width",
      Message: fmt.Sprintf("Max width %d px exceeded", config.MaxWidth),
    })
  }

  if cfg.Height < config.MinHeight {
    errors = append(errors, ValidationError{
      Field:   "height",
      Message: fmt.Sprintf("Min height %d px required", config.MinHeight),
    })
  }
  if cfg.Height > config.MaxHeight {
    errors = append(errors, ValidationError{
      Field:   "height",
      Message: fmt.Sprintf("Max height %d px exceeded", config.MaxHeight),
    })
  }

  // 4. Aspect ratio
  aspectRatio := float32(cfg.Width) / float32(cfg.Height)
  if aspectRatio < config.AspectRatioMin || aspectRatio > config.AspectRatioMax {
    errors = append(errors, ValidationError{
      Field:   "aspectRatio",
      Message: fmt.Sprintf("Aspect ratio must be between %.1f:1 and %.1f:1", 
        config.AspectRatioMin, config.AspectRatioMax),
    })
  }

  return errors
}

func isValidMimeType(mimeType string) bool {
  valid := []string{"image/jpeg", "image/png", "image/webp"}
  for _, v := range valid {
    if mimeType == v {
      return true
    }
  }
  return false
}
```

## Frontend Validation (React)

### Validation Hook

```typescript
// hooks/useImageValidation.ts
import { useState, useCallback } from 'react';

interface ValidationRules {
  maxSizeBytes: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  formats: string[];
}

export function useImageValidation(rules: ValidationRules) {
  const [errors, setErrors] = useState<string[]>([]);

  const validateFile = useCallback((file: File): Promise<boolean> => {
    const newErrors: string[] = [];

    // 1. Format
    if (!rules.formats.includes(file.type)) {
      newErrors.push(`Unsupported format: ${file.type}`);
    }

    // 2. Size
    if (file.size > rules.maxSizeBytes) {
      newErrors.push(
        `File too large: ${(file.size / 1024).toFixed(0)}KB (max ${(rules.maxSizeBytes / 1024).toFixed(0)}KB)`
      );
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return Promise.resolve(false);
    }

    // 3. Dimensions
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const dimensionErrors: string[] = [];

          if (img.width < rules.minWidth) {
            dimensionErrors.push(`Width too small: ${img.width}px (min ${rules.minWidth}px)`);
          }
          if (img.width > rules.maxWidth) {
            dimensionErrors.push(`Width too large: ${img.width}px (max ${rules.maxWidth}px)`);
          }
          if (img.height < rules.minHeight) {
            dimensionErrors.push(`Height too small: ${img.height}px (min ${rules.minHeight}px)`);
          }
          if (img.height > rules.maxHeight) {
            dimensionErrors.push(`Height too large: ${img.height}px (max ${rules.maxHeight}px)`);
          }

          setErrors(dimensionErrors);
          resolve(dimensionErrors.length === 0);
        };
        img.onerror = () => {
          setErrors(['Could not read image']);
          resolve(false);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, [rules]);

  return { validateFile, errors };
}
```

### Usage Example

```typescript
import { useImageValidation } from '@/hooks/useImageValidation';

export function LogoUpload() {
  const { validateFile, errors } = useImageValidation({
    maxSizeBytes: 524288,
    minWidth: 100,
    maxWidth: 400,
    minHeight: 50,
    maxHeight: 200,
    formats: ['image/png', 'image/jpeg'],
  });

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isValid = await validateFile(file);
    if (isValid) {
      // Upload to server
      uploadImage(file);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleChange} accept="image/*" />
      {errors.map((err, i) => (
        <div key={i} className="error">❌ {err}</div>
      ))}
    </div>
  );
}
```

## CI/CD Validation (Node.js)

### Batch Image Validator

```javascript
// scripts/validate-images.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const VALIDATION_CONFIG = {
  logo: {
    minWidth: 100, maxWidth: 400,
    minHeight: 50, maxHeight: 200,
    maxSize: 524288,
    formats: ['jpg', 'jpeg', 'png'],
  },
  // ... other types
};

async function validateImageFile(filePath, imageType) {
  const config = VALIDATION_CONFIG[imageType];
  const errors = [];

  try {
    // Size
    const stats = fs.statSync(filePath);
    if (stats.size > config.maxSize) {
      errors.push(`Size ${stats.size} exceeds max ${config.maxSize}`);
    }

    // Metadata
    const metadata = await sharp(filePath).metadata();

    if (metadata.width < config.minWidth || metadata.width > config.maxWidth) {
      errors.push(`Width ${metadata.width} out of range`);
    }
    if (metadata.height < config.minHeight || metadata.height > config.maxHeight) {
      errors.push(`Height ${metadata.height} out of range`);
    }

    // Strip EXIF
    await sharp(filePath)
      .withMetadata(false)
      .toFile(filePath + '.tmp');
    fs.renameSync(filePath + '.tmp', filePath);

  } catch (err) {
    errors.push(err.message);
  }

  return errors;
}

async function validateAllImages() {
  const imagesDir = './images';
  let failCount = 0;

  const walk = async (dir) => {
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        await walk(filePath);
      } else if (/\.(jpg|jpeg|png)$/i.test(file)) {
        const imageType = filePath.includes('logo') ? 'logo' : 'facility';
        const errors = await validateImageFile(filePath, imageType);
        
        if (errors.length > 0) {
          console.error(`❌ ${filePath}:`);
          errors.forEach(err => console.error(`   ${err}`));
          failCount++;
        } else {
          console.log(`✓ ${filePath}`);
        }
      }
    }
  };

  await walk(imagesDir);
  
  if (failCount > 0) {
    console.error(`\n❌ ${failCount} images failed validation`);
    process.exit(1);
  }
  console.log('\n✓ All images passed validation');
}

validateAllImages();
```

## Common Error Responses

```json
{
  "status": "validation_failed",
  "errors": [
    {"field": "fileSize", "message": "Max size 500 KB exceeded"},
    {"field": "width", "message": "Min width 100 px required"},
    {"field": "aspectRatio", "message": "Aspect ratio must be between 1.5:1 and 4.0:1"}
  ]
}
```

---

**Quick Copy-Paste Rules**:
- **Logo**: 100-400w × 50-200h, 500KB max, PNG/JPEG
- **Facility**: 600-2000w × 400-1500h, 5MB max, JPEG
- **Pet**: 200-4000w × 200-4000h, 2MB max, PNG/JPEG
