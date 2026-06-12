package models

import "time"

// ImageMetadata descreve um ativo de imagem armazenado.
type ImageMetadata struct {
	ID          string    `json:"id"`
	Path        string    `json:"path"`
	URL         string    `json:"url"`
	Width       int       `json:"width"`
	Height      int       `json:"height"`
	Hash        string    `json:"hash"`
	MimeType    string    `json:"mimeType"`
	Size        int64     `json:"size"`
	CacheMaxAge int       `json:"cacheMaxAge"`
	UploadedAt  time.Time `json:"uploadedAt"`
}
