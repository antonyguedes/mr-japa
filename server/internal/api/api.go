// Package api exposes the HTTP routes used by the Next.js client.
package api

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"github.com/devguedes/mr-japa/server/internal/config"
	"github.com/devguedes/mr-japa/server/internal/notify"
	"github.com/devguedes/mr-japa/server/internal/store"
)

const (
	maxLines    = 50
	maxQuantity = 50
	maxPrice    = 1_000_000
)

// imagePath accepts files served by the site itself, such as /menu/edamame.jpg.
var imagePath = regexp.MustCompile(`^(/[A-Za-z0-9_-][A-Za-z0-9._-]*)+\.(jpe?g|png|webp|avif)$`)

type Options struct {
	OrdersPerMinute int
	AdminPerMinute  int
	// Notifier sends WhatsApp messages to customers. Nil means no bot yet.
	Notifier notify.Notifier
}

var DefaultOptions = Options{OrdersPerMinute: 20, AdminPerMinute: 120}

type handler struct {
	cfg      config.Config
	store    *store.Store
	notifier notify.Notifier
}

func New(cfg config.Config, st *store.Store, opts Options) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName:     "mr-japa-api",
		BodyLimit:   64 * 1024,
		Immutable:   true,
		ProxyHeader: fiber.HeaderXForwardedFor,
		// Requests reach the API through the Next.js rewrite on the same host.
		TrustProxy:       true,
		TrustProxyConfig: fiber.TrustProxyConfig{Loopback: true},
		ErrorHandler:     errorHandler,
	})
	app.Use(recover.New())

	h := &handler{cfg: cfg, store: st, notifier: opts.Notifier}
	if h.notifier == nil {
		h.notifier = notify.None{}
	}
	a := app.Group("/api")
	a.Get("/health", func(c fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	a.Get("/restaurant", func(c fiber.Ctx) error { return c.JSON(cfg.Restaurant) })
	a.Get("/menu", h.menu)
	a.Post("/orders", limit(opts.OrdersPerMinute), h.createOrder)
	a.Get("/orders/:code", h.order)

	admin := a.Group("/admin", limit(opts.AdminPerMinute), h.requireAdmin)
	admin.Get("/orders", h.adminOrders)
	admin.Patch("/orders/:code", h.adminSetStatus)
	admin.Patch("/items/:id", h.adminUpdateItem)
	return app
}

func limit(perMinute int) fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        perMinute,
		Expiration: time.Minute,
		LimitReached: func(c fiber.Ctx) error {
			return fail(c, fiber.StatusTooManyRequests, "Muitas tentativas. Aguarde um minuto e tente novamente.")
		},
	})
}

func fail(c fiber.Ctx, status int, message string) error {
	return c.Status(status).JSON(fiber.Map{"error": message})
}

func errorHandler(c fiber.Ctx, err error) error {
	var fe *fiber.Error
	if errors.As(err, &fe) && fe.Code < 500 {
		return fail(c, fe.Code, "Requisição inválida.")
	}
	log.Printf("%s %s: %v", c.Method(), c.Path(), err)
	return fail(c, fiber.StatusInternalServerError, "Erro interno. Tente novamente.")
}

func (h *handler) menu(c fiber.Ctx) error {
	menu, err := h.store.Menu(c.Context())
	if err != nil {
		return err
	}
	return c.JSON(menu)
}

type orderLine struct {
	ItemID   string `json:"item_id"`
	Quantity int    `json:"quantity"`
}

type orderRequest struct {
	CustomerName  string      `json:"customer_name"`
	CustomerPhone string      `json:"customer_phone"`
	Fulfillment   string      `json:"fulfillment"`
	Address       string      `json:"address"`
	PaymentMethod string      `json:"payment_method"`
	Notes         string      `json:"notes"`
	Channel       string      `json:"channel"`
	Items         []orderLine `json:"items"`
}

func (h *handler) createOrder(c fiber.Ctx) error {
	var req orderRequest
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		return fail(c, fiber.StatusBadRequest, "Requisição inválida.")
	}
	in, fields := h.validate(req)
	if len(fields) > 0 {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "Confira os dados do pedido.", "fields": fields})
	}
	if in.Channel == "whatsapp" && h.cfg.WhatsappNumber == "" {
		return fail(c, fiber.StatusConflict, "O pedido pelo WhatsApp não está disponível no momento.")
	}
	o, err := h.store.CreateOrder(c.Context(), in)
	var unavailable store.UnavailableItemError
	if errors.As(err, &unavailable) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":   "Um item do pedido não está mais disponível. Revise o carrinho.",
			"item_id": unavailable.ItemID,
		})
	}
	if err != nil {
		return err
	}
	go h.notifyPlaced(o)
	res := fiber.Map{"order": publicOrder(o)}
	if o.Channel == "whatsapp" {
		res["whatsapp_url"] = whatsappURL(h.cfg.WhatsappNumber, o)
	}
	return c.Status(fiber.StatusCreated).JSON(res)
}

// notifyPlaced runs apart from the request: the order is already saved, so a slow
// or failing bot must not hold it back or make the customer think it failed.
func (h *handler) notifyPlaced(o store.Order) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := h.notifier.Send(ctx, notify.OrderPlaced(o, h.cfg.SiteURL)); err != nil {
		log.Printf("order %s: customer message not sent: %v", o.Code, err)
	}
}

func (h *handler) validate(r orderRequest) (store.NewOrder, map[string]string) {
	fields := map[string]string{}
	in := store.NewOrder{
		Channel:       r.Channel,
		Fulfillment:   r.Fulfillment,
		PaymentMethod: r.PaymentMethod,
		CustomerName:  strings.TrimSpace(r.CustomerName),
		CustomerPhone: onlyDigits(r.CustomerPhone),
		Address:       strings.TrimSpace(r.Address),
		Notes:         strings.TrimSpace(r.Notes),
		Lines:         map[string]int{},
	}
	if n := utf8.RuneCountInString(in.CustomerName); n < 2 || n > 80 {
		fields["customer_name"] = "Informe o seu nome."
	}
	if n := len(in.CustomerPhone); n < 10 || n > 13 {
		fields["customer_phone"] = "Informe um WhatsApp com DDD."
	}
	switch in.Fulfillment {
	case "pickup":
		in.Address = ""
	case "delivery":
		if !h.cfg.Restaurant.DeliveryEnabled {
			fields["fulfillment"] = "A entrega não está disponível no momento."
		}
		if n := utf8.RuneCountInString(in.Address); n < 5 || n > 200 {
			fields["address"] = "Informe o endereço de entrega."
		}
		in.DeliveryFeeCents = h.cfg.Restaurant.DeliveryFeeCents
	default:
		fields["fulfillment"] = "Escolha entre retirada e entrega."
	}
	if _, ok := paymentLabels[in.PaymentMethod]; !ok {
		fields["payment_method"] = "Escolha a forma de pagamento."
	}
	if utf8.RuneCountInString(in.Notes) > 300 {
		fields["notes"] = "Use no máximo 300 caracteres."
	}
	if in.Channel != "site" && in.Channel != "whatsapp" {
		fields["channel"] = "Canal inválido."
	}
	if len(r.Items) == 0 || len(r.Items) > maxLines {
		fields["items"] = "O carrinho está vazio."
	}
	for _, line := range r.Items {
		if line.ItemID == "" || line.Quantity < 1 || in.Lines[line.ItemID]+line.Quantity > maxQuantity {
			fields["items"] = fmt.Sprintf("Cada item aceita de 1 a %d unidades.", maxQuantity)
			break
		}
		in.Lines[line.ItemID] += line.Quantity
	}
	return in, fields
}

// publicOrder is what anyone holding the order code can see: no contact data.
func publicOrder(o store.Order) fiber.Map {
	return fiber.Map{
		"code":               o.Code,
		"status":             o.Status,
		"channel":            o.Channel,
		"fulfillment":        o.Fulfillment,
		"payment_method":     o.PaymentMethod,
		"subtotal_cents":     o.SubtotalCents,
		"delivery_fee_cents": o.DeliveryFeeCents,
		"total_cents":        o.TotalCents,
		"created_at":         o.CreatedAt,
		"items":              o.Items,
	}
}

func (h *handler) order(c fiber.Ctx) error {
	o, err := h.store.Order(c.Context(), c.Params("code"))
	if errors.Is(err, store.ErrNotFound) {
		return fail(c, fiber.StatusNotFound, "Pedido não encontrado.")
	}
	if err != nil {
		return err
	}
	return c.JSON(publicOrder(o))
}

// requireAdmin fails closed: without a configured token the panel stays off.
func (h *handler) requireAdmin(c fiber.Ctx) error {
	if h.cfg.AdminToken == "" {
		return fail(c, fiber.StatusServiceUnavailable, "Painel desativado: defina ADMIN_TOKEN no servidor.")
	}
	got := sha256.Sum256([]byte(strings.TrimPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")))
	want := sha256.Sum256([]byte(h.cfg.AdminToken))
	if subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
		return fail(c, fiber.StatusUnauthorized, "Código de acesso inválido.")
	}
	return c.Next()
}

func (h *handler) adminOrders(c fiber.Ctx) error {
	orders, err := h.store.RecentOrders(c.Context(), 100)
	if err != nil {
		return err
	}
	return c.JSON(orders)
}

func (h *handler) adminSetStatus(c fiber.Ctx) error {
	var body struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		return fail(c, fiber.StatusBadRequest, "Requisição inválida.")
	}
	o, err := h.store.SetStatus(c.Context(), c.Params("code"), body.Status)
	switch {
	case errors.Is(err, store.ErrNotFound):
		return fail(c, fiber.StatusNotFound, "Pedido não encontrado.")
	case errors.Is(err, store.ErrInvalidTransition):
		return fail(c, fiber.StatusConflict, "Esse pedido não pode ir para esse status.")
	case err != nil:
		return err
	}
	return c.JSON(o)
}

func (h *handler) adminUpdateItem(c fiber.Ctx) error {
	var body struct {
		PriceCents *int    `json:"price_cents"`
		Available  *bool   `json:"available"`
		Image      *string `json:"image"`
	}
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		return fail(c, fiber.StatusBadRequest, "Requisição inválida.")
	}
	if body.PriceCents != nil && (*body.PriceCents <= 0 || *body.PriceCents > maxPrice) {
		return fail(c, fiber.StatusUnprocessableEntity, "Preço inválido.")
	}
	if body.Image != nil && *body.Image != "" && !imagePath.MatchString(*body.Image) {
		return fail(c, fiber.StatusUnprocessableEntity, "Use o caminho de uma imagem do site, como /menu/edamame.jpg.")
	}
	err := h.store.UpdateItem(c.Context(), c.Params("id"), body.PriceCents, body.Available, body.Image)
	if errors.Is(err, store.ErrNotFound) {
		return fail(c, fiber.StatusNotFound, "Item não encontrado.")
	}
	if err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

var paymentLabels = map[string]string{
	"pix":  "Pix",
	"card": "Cartão",
	"cash": "Dinheiro",
}

func whatsappURL(number string, o store.Order) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Olá! Quero fazer o pedido %s:\n\n", o.Code)
	for _, it := range o.Items {
		fmt.Fprintf(&b, "%dx %s (%s)\n", it.Quantity, it.Name, money(it.UnitPriceCents*it.Quantity))
	}
	fmt.Fprintf(&b, "\nTotal: %s", money(o.TotalCents))
	if o.Fulfillment == "delivery" && o.DeliveryFeeCents == 0 {
		b.WriteString(" + taxa de entrega")
	}
	fmt.Fprintf(&b, "\nNome: %s\nPagamento: %s\n", o.CustomerName, paymentLabels[o.PaymentMethod])
	if o.Fulfillment == "delivery" {
		fmt.Fprintf(&b, "Entrega em: %s\n", o.Address)
	} else {
		b.WriteString("Retirada no restaurante\n")
	}
	if o.Notes != "" {
		fmt.Fprintf(&b, "Observações: %s\n", o.Notes)
	}
	return "https://wa.me/" + number + "?text=" + url.QueryEscape(b.String())
}

func money(cents int) string {
	return fmt.Sprintf("R$ %d,%02d", cents/100, cents%100)
}

func onlyDigits(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, s)
}
