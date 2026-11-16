// Package config reads the server settings from the environment.
package config

import (
	"os"
	"strconv"
	"strings"
)

// Restaurant holds the public facts shown on the site. Empty fields are not displayed.
type Restaurant struct {
	Name             string `json:"name"`
	Address          string `json:"address"`
	Hours            string `json:"hours"`
	Phone            string `json:"phone"`
	Email            string `json:"email"`
	Instagram        string `json:"instagram"`
	MapURL           string `json:"map_url"`
	WhatsappEnabled  bool   `json:"whatsapp_enabled"`
	DeliveryEnabled  bool   `json:"delivery_enabled"`
	DeliveryFeeCents int    `json:"delivery_fee_cents"`
}

type Config struct {
	Addr           string
	DatabasePath   string
	AdminToken     string
	WhatsappNumber string
	SiteURL        string
	Restaurant     Restaurant
}

func Load() Config {
	whatsapp := digits(os.Getenv("WHATSAPP_NUMBER"))
	fee, err := strconv.Atoi(os.Getenv("DELIVERY_FEE_CENTS"))
	if err != nil || fee < 0 {
		fee = 0
	}
	return Config{
		Addr:           env("API_ADDR", "127.0.0.1:8080"),
		DatabasePath:   env("DATABASE_PATH", "data/mrjapa.db"),
		AdminToken:     os.Getenv("ADMIN_TOKEN"),
		WhatsappNumber: whatsapp,
		SiteURL:        strings.TrimRight(env("SITE_URL", "http://localhost:3000"), "/"),
		Restaurant: Restaurant{
			Name:             "Mr Japa",
			Address:          os.Getenv("RESTAURANT_ADDRESS"),
			Hours:            os.Getenv("RESTAURANT_HOURS"),
			Phone:            os.Getenv("RESTAURANT_PHONE"),
			Email:            os.Getenv("RESTAURANT_EMAIL"),
			Instagram:        os.Getenv("RESTAURANT_INSTAGRAM"),
			MapURL:           os.Getenv("RESTAURANT_MAP_URL"),
			WhatsappEnabled:  whatsapp != "",
			DeliveryEnabled:  env("DELIVERY_ENABLED", "true") == "true",
			DeliveryFeeCents: fee,
		},
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func digits(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, s)
}
