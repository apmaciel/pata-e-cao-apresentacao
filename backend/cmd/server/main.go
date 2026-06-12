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

	// ── Banco de Dados ──────────────────────────────────────────────────────────
	db, err := postgres.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("falha na conexão com banco de dados: %v", err)
	}
	defer db.Close()

	// Resolve o diretório de migrations. MIGRATIONS_DIR tem precedência
	// (obrigatório no Docker). Fallback para caminho relativo ao binário.
	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		exe, err := os.Executable()
		if err != nil {
			log.Fatalf("could not resolve executable path: %v", err)
		}
		migrationsDir = filepath.Join(filepath.Dir(exe), "migrations")
	}

	if err := postgres.RunMigrations(db, migrationsDir); err != nil {
		log.Fatalf("migrations falharam: %v", err)
	}

	// ── Repositórios ─────────────────────────────────────────────────────────
	userRepo := postgres.NewUserRepository(db)
	providerRepo := postgres.NewProviderRepository(db)
	onboardingTokenRepo := postgres.NewOnboardingTokenRepository(db)
	reviewRepo := postgres.NewReviewRepository(db)
	tokenRepo := postgres.NewTokenRepository(db)
	passwordResetRepo := postgres.NewPasswordResetRepository(db)

	// ── Busca (opcional) ────────────────────────────────────────────────────
	// Quando TYPESENSE_URL está vazio, o serviço roda sem Typesense e o
	// endpoint /providers serve resultados diretamente do PostgreSQL.
	var searchSvc service.SearchService
	if cfg.TypesenseURL != "" {
		bootCtx, cancelBoot := context.WithTimeout(context.Background(), 10*time.Second)
		ts, err := service.NewTypesenseSearch(bootCtx, cfg.TypesenseURL, cfg.TypesenseAPIKey)
		cancelBoot()
		if err != nil {
			log.Printf("inicialização do typesense falhou (%v); usando fallback para PostgreSQL", err)
		} else {
			searchSvc = ts
			log.Printf("typesense inicializado em %s", cfg.TypesenseURL)
		}
	}

	// ── Serviços ─────────────────────────────────────────────────────────────
	authSvc := service.NewAuthService(
		db, userRepo, tokenRepo, passwordResetRepo, providerRepo, onboardingTokenRepo,
		cfg.JWTSecret, cfg.JWTAccessExpiry, cfg.JWTRefreshExpiry, cfg.PasswordResetTTL,
		cfg.AdminEmails,
	)
	providerSvc := service.NewProviderService(providerRepo, searchSvc, onboardingTokenRepo, userRepo)
	reviewSvc := service.NewReviewService(reviewRepo, providerRepo, searchSvc)
	imageSvc, err := service.NewImageService(cfg.LRUCacheSize, cfg.ImageStorageType, cfg.ImageStoragePath, cfg.SeaweedFSURL)
	if err != nil {
		log.Fatalf("image service init failed: %v", err)
	}
	adminSvc := service.NewAdminService(postgres.NewStatsRepository(db))

	// Reindexa o Typesense a cada inicialização para manter o índice de busca
	// sincronizado com a fonte de verdade no PostgreSQL.
	if searchSvc != nil {
		reindexCtx, cancelReindex := context.WithTimeout(context.Background(), 30*time.Second)
		n, reindexErr := providerSvc.ReindexAll(reindexCtx)
		cancelReindex()
		if reindexErr != nil {
			log.Printf("startup reindex failed: %v", reindexErr)
		} else {
			log.Printf("startup reindex complete: %d providers indexed", n)
		}
	}

	// ── Handlers ─────────────────────────────────────────────────────────────
	authH := handler.NewAuthHandler(authSvc, cfg.CookieSecure, cfg.JWTRefreshExpiry, cfg.FrontendURL, cfg.DevMode)
	providerH := handler.NewProviderHandler(providerSvc, reviewSvc)
	reviewH := handler.NewReviewHandler(reviewSvc)
	imageH := handler.NewImageHandler(imageSvc, cfg.CORSOrigins, cfg.JWTSecret, onboardingTokenRepo)
	adminH := handler.NewAdminHandler(providerSvc, adminSvc)
	searchH := handler.NewSearchHandler(providerSvc)
	onboardingH := handler.NewOnboardingHandler(providerSvc)

	// ── Configuração do Echo ───────────────────────────────────────────────────
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

	// Health check (sem autenticação).
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"status":    "ok",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// ── Rotas ───────────────────────────────────────────────────────────────
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

	// Providers
	providers := api.Group("/providers")
	providers.GET("", providerH.ListProviders)                                    // público
	providers.GET("/me", providerH.GetMyProvider, jwtMw)                          // requer autenticação — perfil próprio
	providers.PUT("/me", providerH.UpdateMyProvider, jwtMw)                       // requer autenticação — editar perfil próprio
	providers.DELETE("/me", providerH.DeleteMyProvider, jwtMw)                    // requer autenticação — excluir conta (confirmação de senha)
	providers.POST("/me/gallery", providerH.AddGalleryImage, jwtMw)               // requer autenticação — adicionar imagem à galeria
	providers.DELETE("/me/gallery/:imageId", providerH.RemoveGalleryImage, jwtMw) // requer autenticação
	providers.GET("/:id", providerH.GetProvider)                                  // público (apenas aprovados)
	providers.POST("/register", authH.RegisterProvider)                           // público — cadastro + aplicação combinados
	providers.POST("/apply", providerH.Apply, jwtMw)                              // requer autenticação
	providers.GET("/:id/reviews", providerH.GetProviderReviews)                   // público
	providers.POST("/onboarding/validate", onboardingH.ValidateToken)             // público — o token é a autenticação
	providers.POST("/onboarding/complete", onboardingH.Complete)                  // público — o token é a autenticação

	// Reviews (requer autenticação)
	api.POST("/reviews", reviewH.CreateReview, jwtMw)

	// Imagens
	// Wildcard captura IDs com barras como "partner-1/logo" e
	// "defaults/pet-placeholder". O handler roteia sufixo /metadata.
	api.GET("/images/*", imageH.Handle)
	api.POST("/images/upload", imageH.UploadImage)

	// Admin (requer autenticação + papel admin)
	adminGroup := api.Group("/admin", jwtMw, mw.RequireAdmin())
	adminGroup.GET("/stats", adminH.GetStats)
	adminGroup.GET("/stats/providers", adminH.GetProviderGrowth)
	adminGroup.GET("/providers", adminH.ListAllProviders)          // paginado, ?status= opcional
	adminGroup.GET("/providers/export", adminH.ExportProvidersCSV) // download CSV, ?status= opcional
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

	// Autocomplete de busca (público)
	api.GET("/search/autocomplete", searchH.Autocomplete)

	// ── Desligamento gracioso ────────────────────────────────────────────────
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
