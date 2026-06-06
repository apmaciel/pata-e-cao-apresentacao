package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	lru "github.com/hashicorp/golang-lru/v2"

	"pata-cao/internal/models"
)

// ImageType enumerates the supported image categories.
type ImageType string

const (
	ImageTypeLogo     ImageType = "logo"
	ImageTypeFacility ImageType = "facility"
	ImageTypeDocument ImageType = "document"
	ImageTypeProvider ImageType = "provider"
)

// imageConstraints holds validation rules per image category.
type imageConstraints struct {
	MinWidth  int
	MaxWidth  int
	MinHeight int
	MaxHeight int
	MaxBytes  int64
	MimeTypes []string
}

var constraints = map[ImageType]imageConstraints{
	ImageTypeLogo: {
		MinWidth: 100, MaxWidth: 400,
		MinHeight: 50, MaxHeight: 200,
		MaxBytes:  500 * 1024,
		MimeTypes: []string{"image/png", "image/jpeg"},
	},
	ImageTypeFacility: {
		MinWidth: 600, MaxWidth: 2000,
		MinHeight: 400, MaxHeight: 1500,
		MaxBytes:  5 * 1024 * 1024,
		MimeTypes: []string{"image/jpeg"},
	},
	ImageTypeDocument: {
		MinWidth: 0, MaxWidth: 0, // dimension check skipped for documents
		MinHeight: 0, MaxHeight: 0,
		MaxBytes:  10 * 1024 * 1024,
		MimeTypes: []string{"application/pdf", "image/jpeg", "image/png"},
	},
	ImageTypeProvider: {
		MinWidth: 100, MaxWidth: 4000,
		MinHeight: 100, MaxHeight: 4000,
		MaxBytes:  2 * 1024 * 1024,
		MimeTypes: []string{"image/jpeg", "image/png"},
	},
}

// cachedImage holds image bytes + metadata in the LRU.
type cachedImage struct {
	Data     []byte
	Metadata *models.ImageMetadata
}

// ImageService handles image retrieval, validation, and caching.
type ImageService struct {
	cache        *lru.Cache[string, *cachedImage]
	storageType  string // "local" or "seaweedfs"
	storagePath  string
	seaweedFSURL string
	baseURL      string // e.g. "https://api.pata-cao.com" — used to construct metadata URLs
}

// NewImageService creates a new ImageService with an LRU cache of given size.
func NewImageService(cacheSize int, storageType, storagePath, seaweedFSURL string) (*ImageService, error) {
	c, err := lru.New[string, *cachedImage](cacheSize)
	if err != nil {
		return nil, fmt.Errorf("create lru cache: %w", err)
	}
	return &ImageService{
		cache:        c,
		storageType:  storageType,
		storagePath:  storagePath,
		seaweedFSURL: seaweedFSURL,
	}, nil
}

// SetBaseURL allows the server to inject the public base URL after startup.
func (s *ImageService) SetBaseURL(base string) { s.baseURL = base }

// FetchImage returns raw bytes and whether it was a cache hit.
func (s *ImageService) FetchImage(imageID string) ([]byte, bool, error) {
	if item, ok := s.cache.Get(imageID); ok {
		return item.Data, true, nil
	}

	data, err := s.loadFromStorage(imageID)
	if err != nil {
		return nil, false, fmt.Errorf("IMAGE_NOT_FOUND: %w", err)
	}

	meta := s.buildMetadata(imageID, data)
	s.cache.Add(imageID, &cachedImage{Data: data, Metadata: meta})
	return data, false, nil
}

// GetMetadata returns metadata for an image (fetches + caches if needed).
func (s *ImageService) GetMetadata(imageID string) (*models.ImageMetadata, error) {
	if item, ok := s.cache.Get(imageID); ok && item.Metadata != nil {
		return item.Metadata, nil
	}

	data, err := s.loadFromStorage(imageID)
	if err != nil {
		return nil, fmt.Errorf("IMAGE_NOT_FOUND: %w", err)
	}

	meta := s.buildMetadata(imageID, data)
	s.cache.Add(imageID, &cachedImage{Data: data, Metadata: meta})
	return meta, nil
}

// InvalidateCache removes one or more images from the LRU.
func (s *ImageService) InvalidateCache(imageIDs []string) {
	for _, id := range imageIDs {
		s.cache.Remove(id)
	}
}

// StoreImage persists image bytes and invalidates any cached entry.
// When storageType is "seaweedfs" the bytes are PUT to the SeaweedFS filer;
// otherwise they are written to the local filesystem.
func (s *ImageService) StoreImage(imageID string, data []byte) error {
	if s.storageType == "seaweedfs" {
		if s.seaweedFSURL == "" {
			return fmt.Errorf("SEAWEEDFS_URL is not configured")
		}
		url := fmt.Sprintf("%s/%s", s.seaweedFSURL, imageID)
		req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(data)) //nolint:gosec
		if err != nil {
			return fmt.Errorf("create seaweedfs PUT request: %w", err)
		}
		req.Header.Set("Content-Type", http.DetectContentType(data))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return fmt.Errorf("seaweedfs PUT: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 {
			return fmt.Errorf("seaweedfs returned %d for PUT %q", resp.StatusCode, imageID)
		}
		s.cache.Remove(imageID)
		return nil
	}

	dest := filepath.Join(s.storagePath, imageID)
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return fmt.Errorf("create image directory: %w", err)
	}
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		return fmt.Errorf("write image: %w", err)
	}
	s.cache.Remove(imageID)
	return nil
}

// ValidateImage checks magic bytes, MIME type, dimensions, and file size.
func (s *ImageService) ValidateImage(data []byte, imgType ImageType) error {
	c, ok := constraints[imgType]
	if !ok {
		return fmt.Errorf("VALIDATION_ERROR: unknown image type %q", imgType)
	}

	if int64(len(data)) > c.MaxBytes {
		return fmt.Errorf("VALIDATION_ERROR: file size %d exceeds maximum %d bytes", len(data), c.MaxBytes)
	}
	if len(data) == 0 {
		return fmt.Errorf("VALIDATION_ERROR: empty file")
	}

	mimeType := http.DetectContentType(data)
	allowed := false
	for _, m := range c.MimeTypes {
		if m == mimeType {
			allowed = true
			break
		}
	}
	if !allowed {
		return fmt.Errorf("VALIDATION_ERROR: unsupported MIME type %q for %s image", mimeType, imgType)
	}

	// Dimension check: skipped for PDFs and types with zero-valued constraints.
	if c.MinWidth > 0 || c.MaxWidth > 0 {
		cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return fmt.Errorf("VALIDATION_ERROR: cannot decode image dimensions")
		}
		if cfg.Width < c.MinWidth || cfg.Width > c.MaxWidth {
			return fmt.Errorf("VALIDATION_ERROR: width %d is out of range [%d, %d]", cfg.Width, c.MinWidth, c.MaxWidth)
		}
		if cfg.Height < c.MinHeight || cfg.Height > c.MaxHeight {
			return fmt.Errorf("VALIDATION_ERROR: height %d is out of range [%d, %d]", cfg.Height, c.MinHeight, c.MaxHeight)
		}
	}

	return nil
}

// ── private helpers ───────────────────────────────────────────────────────────

func (s *ImageService) loadFromStorage(imageID string) ([]byte, error) {
	localPath := filepath.Join(s.storagePath, imageID)
	data, err := os.ReadFile(localPath)
	if err == nil {
		return data, nil
	}

	if s.seaweedFSURL != "" {
		url := fmt.Sprintf("%s/%s", s.seaweedFSURL, imageID)
		resp, err := http.Get(url) //nolint:gosec
		if err != nil {
			return nil, fmt.Errorf("seaweedfs fetch: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("seaweedfs returned %d for %q", resp.StatusCode, imageID)
		}
		return io.ReadAll(resp.Body)
	}

	return nil, fmt.Errorf("image %q not found", imageID)
}

// buildMetadata computes SHA-256 hash, dimensions, and public URL.
func (s *ImageService) buildMetadata(imageID string, data []byte) *models.ImageMetadata {
	mimeType := http.DetectContentType(data)

	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])

	var w, h int
	if cfg, _, err := image.DecodeConfig(bytes.NewReader(data)); err == nil {
		w, h = cfg.Width, cfg.Height
	}

	publicURL := fmt.Sprintf("/api/images/%s", imageID)
	if s.baseURL != "" {
		publicURL = fmt.Sprintf("%s/api/images/%s", s.baseURL, imageID)
	}

	return &models.ImageMetadata{
		ID:          imageID,
		Path:        filepath.Join(s.storagePath, imageID),
		URL:         publicURL,
		MimeType:    mimeType,
		Size:        int64(len(data)),
		Hash:        hash,
		Width:       w,
		Height:      h,
		CacheMaxAge: 2592000, // 30 days
		UploadedAt:  time.Now(),
	}
}

// MarshalMetadata serialises ImageMetadata to JSON bytes.
func MarshalMetadata(m *models.ImageMetadata) ([]byte, error) {
	return json.Marshal(m)
}
