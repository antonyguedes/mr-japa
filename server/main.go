package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"

	"github.com/devguedes/mr-japa/server/internal/api"
	"github.com/devguedes/mr-japa/server/internal/config"
	"github.com/devguedes/mr-japa/server/internal/store"
)

func main() {
	// Real environment variables win over .env; the file is optional.
	_ = godotenv.Load()
	cfg := config.Load()

	st, err := store.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer st.Close()
	if cfg.AdminToken == "" {
		log.Print("ADMIN_TOKEN not set: the admin panel is disabled")
	}

	app := api.New(cfg, st, api.DefaultOptions)
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
		<-stop
		_ = app.Shutdown()
	}()
	if err := app.Listen(cfg.Addr); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
