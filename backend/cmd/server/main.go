package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"time"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"pata-cao/internal/config"
	"pata-cao/internal/handler"
	mw "pata-cao/internal/middleware"
	"pata-cao/internal/repository/postgres"
	"pata-cao/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	// ── Database ──────────────────────────────────────────────────────────────
	db, err := postgres.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()

	// Resolve migrations directory. MIGRATIONS_DIR env var takes precedence
	// (required in Docker where source paths don't exist). Falls back to
	// a path relative to the running binary for local dev.
	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		exe, err := os.Executable()
		if err != nil {
			log.Fatalf("could not resolve executable path: %v", err)
		}
		migrationsDir = filepath.Join(filepath.Dir(exe), "migrations")
	}

	if err := postgres.RunMigrations(db, migrationsDir); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}

	// ── Repositories ─────────────────────────────────────────────────────────
	userRepo := postgres.NewUserRepository(db)
	petRepo := postgres.NewPetRepository(db)
	providerRepo := postgres.NewProviderRepository(db)
	onboardingTokenRepo := postgres.NewOnboardingTokenRepository(db)
	bookingRepo := postgres.NewBookingRepository(db)
	reviewRepo := postgres.NewReviewRepository(db)
	tokenRepo := postgres.NewTokenRepository(db)
	passwordResetRepo := postgres.NewPasswordResetRepository(db)

	// ── Search (optional) ────────────────────────────────────────────────────
	// When TYPESENSE_URL is empty the service runs without Typesense and the
	// /providers list endpoint serves results from PostgreSQL directly.
	var searchSvc service.SearchService
	if cfg.TypesenseURL != "" {
		bootCtx, cancelBoot := context.WithTimeout(context.Background(), 10*time.Second)
		ts, err := service.NewTypesenseSearch(bootCtx, cfg.TypesenseURL, cfg.TypesenseAPIKey)
		cancelBoot()
		if err != nil {
			log.Printf("typesense init failed (%v); falling back to PostgreSQL search", err)
		} else {
			searchSvc = ts
			log.Printf("typesense initialized at %s", cfg.TypesenseURL)
		}
	}

	// ── Services ─────────────────────────────────────────────────────────────
	authSvc := service.NewAuthService(
		db, userRepo, tokenRepo, passwordResetRepo, providerRepo, onboardingTokenRepo,
		cfg.JWTSecret, cfg.JWTAccessExpiry, cfg.JWTRefreshExpiry, cfg.PasswordResetTTL,
		cfg.AdminEmails,
	)
	petSvc := service.NewPetService(petRepo, bookingRepo)
	providerSvc := service.NewProviderService(providerRepo, searchSvc, onboardingTokenRepo, userRepo)
	bookingSvc := service.NewBookingService(bookingRepo, providerRepo, petRepo)
	reviewSvc := service.NewReviewService(reviewRepo, bookingRepo, providerRepo, searchSvc)
	imageSvc, err := service.NewImageService(cfg.LRUCacheSize, cfg.ImageStorageType, cfg.ImageStoragePath, cfg.SeaweedFSURL)
	if err != nil {
		log.Fatalf("image service init failed: %v", err)
	}
	adminSvc := service.NewAdminService(postgres.NewStatsRepository(db))

	// ── Handlers ─────────────────────────────────────────────────────────────
	authH := handler.NewAuthHandler(authSvc, bookingRepo, cfg.CookieSecure, cfg.JWTRefreshExpiry, cfg.FrontendURL, cfg.DevMode)
	petH := handler.NewPetHandler(petSvc)
	providerH := handler.NewProviderHandler(providerSvc, reviewSvc)
	bookingH := handler.NewBookingHandler(bookingSvc)
	reviewH := handler.NewReviewHandler(reviewSvc)
	imageH := handler.NewImageHandler(imageSvc, cfg.CORSOrigins, cfg.JWTSecret, onboardingTokenRepo)
	adminH := handler.NewAdminHandler(providerSvc, adminSvc)
	searchH := handler.NewSearchHandler(providerSvc)
	onboardingH := handler.NewOnboardingHandler(providerSvc)

	// ── Echo setup ───────────────────────────────────────────────────────────
	e := echo.New()
	e.HideBanner = true

	rateLimiter := mw.NewRateLimiter(cfg.RateLimitRequests, cfg.RateLimitWindow)

	e.Use(echomw.Logger())
	e.Use(echomw.Recover())
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins:     []string{cfg.CORSOrigins},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderContentType, echo.HeaderAuthorization},
		AllowCredentials: true,
	}))
	e.Use(rateLimiter.Middleware())

	// Health check (no auth).
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"status":    "ok",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// ── Routes ───────────────────────────────────────────────────────────────
	api := e.Group("/api")
	jwtMw := mw.JWTAuth(cfg.JWTSecret)

	// Auth
	auth := api.Group("/auth")
	auth.POST("/signup", authH.Signup)
	auth.POST("/login", authH.Login)
	auth.POST("/refresh", authH.Refresh)
	auth.DELETE("/logout", authH.Logout)
	auth.POST("/password-reset/request", authH.RequestPasswordReset)
	auth.POST("/password-reset/confirm", authH.ConfirmPasswordReset)
	auth.GET("/profile", authH.GetProfile, jwtMw)
	auth.PUT("/profile", authH.UpdateProfile, jwtMw)
	auth.DELETE("/profile", authH.DeleteProfile, jwtMw)

	// Users (profile access gated by ownership, admin role, or booking relationship)
	api.GET("/users/:id", authH.GetUserProfile, jwtMw)

	// Pets (all require auth)
	pets := api.Group("/pets", jwtMw)
	pets.GET("", petH.ListPets)
	pets.POST("", petH.CreatePet)
	pets.GET("/:id", petH.GetPet)
	pets.PUT("/:id", petH.UpdatePet)
	pets.DELETE("/:id", petH.DeletePet)
	pets.GET("/:id/health", petH.GetHealthRecord)
	pets.PUT("/:id/health", petH.UpdateHealthRecord)
	pets.GET("/:id/images", petH.ListImages)
	pets.POST("/:id/images", petH.AddImage)
	pets.DELETE("/:id/images/:imageId", petH.DeleteImage)
	pets.PUT("/:id/images/:imageId/primary", petH.SetPrimaryImage)

	// Providers
	providers := api.Group("/providers")
	providers.GET("", providerH.ListProviders)                                    // public
	providers.GET("/me", providerH.GetMyProvider, jwtMw)                          // auth required — own profile
	providers.PUT("/me", providerH.UpdateMyProvider, jwtMw)                       // auth required — edit own profile
	providers.POST("/me/gallery", providerH.AddGalleryImage, jwtMw)               // auth required — add gallery image
	providers.DELETE("/me/gallery/:imageId", providerH.RemoveGalleryImage, jwtMw) // auth required
	providers.GET("/:id", providerH.GetProvider)                                  // public (approved only)
	providers.POST("/register", authH.RegisterProvider)                           // public — combined signup + apply
	providers.POST("/apply", providerH.Apply, jwtMw)                              // auth required
	providers.GET("/:id/reviews", providerH.GetProviderReviews)                   // public
	providers.POST("/onboarding/validate", onboardingH.ValidateToken)             // public — token is the auth
	providers.POST("/onboarding/complete", onboardingH.Complete)                  // public — token is the auth

	// Bookings (all require auth)
	bookings := api.Group("/bookings", jwtMw)
	bookings.POST("", bookingH.CreateBooking)
	bookings.GET("", bookingH.ListBookings)
	bookings.GET("/:id", bookingH.GetBooking)
	bookings.PUT("/:id/confirm", bookingH.ConfirmBooking)
	bookings.PUT("/:id/cancel", bookingH.CancelBooking)

	// Reviews (auth required)
	api.POST("/reviews", reviewH.CreateReview, jwtMw)

	// Images
	// Wildcard captures slash-containing IDs like "partner-1/logo" and
	// "defaults/pet-placeholder". The handler itself routes /metadata suffix.
	api.GET("/images/*", imageH.Handle)
	api.POST("/images/upload", imageH.UploadImage)

	// Admin (auth + admin role)
	adminGroup := api.Group("/admin", jwtMw, mw.RequireAdmin())
	adminGroup.GET("/stats", adminH.GetStats)
	adminGroup.GET("/stats/providers", adminH.GetProviderGrowth)
	adminGroup.GET("/stats/pets/species", adminH.GetPetSpeciesDistribution)
	adminGroup.GET("/stats/pets/ages", adminH.GetPetAgeDistribution)
	adminGroup.GET("/providers", adminH.ListAllProviders)          // paginated, optional ?status=
	adminGroup.GET("/providers/export", adminH.ExportProvidersCSV) // CSV download, optional ?status=
	adminGroup.GET("/providers/pending", adminH.GetPendingProviders)
	adminGroup.GET("/providers/:id/audit", adminH.GetAuditLog)
	adminGroup.POST("/providers/:id/approve", adminH.ApproveProvider)
	adminGroup.POST("/providers/:id/reject", adminH.RejectProvider)
	adminGroup.POST("/providers/:id/suspend", adminH.SuspendProvider)
	adminGroup.POST("/providers/:id/unsuspend", adminH.UnsuspendProvider)
	adminGroup.POST("/providers/:id/regenerate-token", adminH.RegenerateOnboardingToken)
	adminGroup.DELETE("/providers/:id", adminH.DeleteProvider)
	adminGroup.POST("/cache/invalidate", imageH.InvalidateCache)
	adminGroup.POST("/search/reindex", searchH.Reindex)

	// ── Graceful shutdown ────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)

	go func() {
		if err := e.Start(":" + cfg.Port); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	log.Printf("server started on port %s", cfg.Port)
	<-quit
	log.Println("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := e.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown error: %v", err)
	}
	log.Println("server stopped")
}
