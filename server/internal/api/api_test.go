package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/devguedes/mr-japa/server/internal/config"
	"github.com/devguedes/mr-japa/server/internal/notify"
	"github.com/devguedes/mr-japa/server/internal/store"
)

const adminToken = "test-token"

func testConfig() config.Config {
	return config.Config{
		AdminToken:     adminToken,
		WhatsappNumber: "5511999999999",
		SiteURL:        "https://mrjapa.example",
		Restaurant:     config.Restaurant{Name: "Mr Japa", WhatsappEnabled: true, DeliveryEnabled: true, DeliveryFeeCents: 700},
	}
}

func newApp(t *testing.T, cfg config.Config, opts Options) *fiber.App {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	return New(cfg, st, opts)
}

func call(t *testing.T, app *fiber.App, method, path, body, token string) (int, map[string]any, string) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return res.StatusCode, out, string(raw)
}

const validOrder = `{"customer_name":"Ana Souza","customer_phone":"(11) 98888-7777","fulfillment":"pickup",
	"payment_method":"pix","channel":"site","items":[{"item_id":"edamame","quantity":2}]}`

func TestMenuIsSeeded(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	status, body, _ := call(t, app, http.MethodGet, "/api/menu", "", "")
	if status != 200 || len(body["categories"].([]any)) == 0 {
		t.Fatalf("status %d, body %v", status, body)
	}
}

func TestOrderPricesComeFromTheServer(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	sent := strings.Replace(validOrder, `"quantity":2}`, `"quantity":2,"price_cents":1,"unit_price_cents":1}`, 1)
	sent = strings.Replace(sent, `"channel"`, `"total_cents":1,"channel"`, 1)
	status, body, raw := call(t, app, http.MethodPost, "/api/orders", sent, "")
	if status != 201 {
		t.Fatalf("status %d: %s", status, raw)
	}
	order := body["order"].(map[string]any)
	if order["total_cents"] != float64(3600) {
		t.Fatalf("total %v, want 3600", order["total_cents"])
	}
}

func TestDuplicateLinesAreMerged(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	sent := strings.Replace(validOrder, `{"item_id":"edamame","quantity":2}`, `{"item_id":"edamame","quantity":1},{"item_id":"edamame","quantity":2}`, 1)
	_, body, raw := call(t, app, http.MethodPost, "/api/orders", sent, "")
	order, ok := body["order"].(map[string]any)
	if !ok || order["total_cents"] != float64(5400) {
		t.Fatalf("unexpected: %s", raw)
	}
}

func TestDeliveryAddsFeeAndRequiresAddress(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	noAddress := strings.Replace(validOrder, `"pickup"`, `"delivery"`, 1)
	status, body, _ := call(t, app, http.MethodPost, "/api/orders", noAddress, "")
	if status != 422 || body["fields"].(map[string]any)["address"] == nil {
		t.Fatalf("status %d, body %v", status, body)
	}
	withAddress := strings.Replace(noAddress, `"channel"`, `"address":"Rua Um, 10","channel"`, 1)
	_, body, raw := call(t, app, http.MethodPost, "/api/orders", withAddress, "")
	order, ok := body["order"].(map[string]any)
	if !ok || order["total_cents"] != float64(4300) {
		t.Fatalf("unexpected: %s", raw)
	}
}

func TestInvalidOrdersAreRejected(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	cases := map[string]struct {
		from, to string
		want     int
	}{
		"no name":       {`"Ana Souza"`, `" "`, 422},
		"bad phone":     {`"(11) 98888-7777"`, `"123"`, 422},
		"bad payment":   {`"pix"`, `"bitcoin"`, 422},
		"bad channel":   {`"site"`, `"fax"`, 422},
		"zero quantity": {`"quantity":2`, `"quantity":0`, 422},
		"negative":      {`"quantity":2`, `"quantity":-3`, 422},
		"too many":      {`"quantity":2`, `"quantity":51`, 422},
		"unknown item":  {`"edamame"`, `"nao-existe"`, 409},
		"broken json":   {`"items"`, `items`, 400},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			status, _, raw := call(t, app, http.MethodPost, "/api/orders", strings.Replace(validOrder, tc.from, tc.to, 1), "")
			if status != tc.want {
				t.Fatalf("status %d, want %d: %s", status, tc.want, raw)
			}
		})
	}
}

func TestWhatsappOrderReturnsEncodedLink(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	sent := strings.Replace(validOrder, `"site"`, `"whatsapp"`, 1)
	_, body, raw := call(t, app, http.MethodPost, "/api/orders", sent, "")
	link, _ := body["whatsapp_url"].(string)
	parsed, err := url.Parse(link)
	if err != nil || parsed.Host != "wa.me" || parsed.Path != "/5511999999999" {
		t.Fatalf("bad link %q: %s", link, raw)
	}
	code := body["order"].(map[string]any)["code"].(string)
	text := parsed.Query().Get("text")
	for _, want := range []string{code, "2x Edamame", "R$ 36,00", "Ana Souza", "Pix"} {
		if !strings.Contains(text, want) {
			t.Fatalf("message missing %q:\n%s", want, text)
		}
	}
}

func TestWhatsappUnavailableWithoutNumber(t *testing.T) {
	cfg := testConfig()
	cfg.WhatsappNumber = ""
	app := newApp(t, cfg, DefaultOptions)
	status, _, _ := call(t, app, http.MethodPost, "/api/orders", strings.Replace(validOrder, `"site"`, `"whatsapp"`, 1), "")
	if status != 409 {
		t.Fatalf("status %d", status)
	}
}

func TestPublicOrderHidesContactData(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	withAddress := strings.Replace(strings.Replace(validOrder, `"pickup"`, `"delivery"`, 1), `"channel"`, `"address":"Rua Secreta, 10","channel"`, 1)
	_, created, raw := call(t, app, http.MethodPost, "/api/orders", withAddress, "")
	if strings.Contains(raw, "Ana Souza") || strings.Contains(raw, "Rua Secreta") || strings.Contains(raw, "98888") {
		t.Fatalf("create response leaks contact data: %s", raw)
	}
	code := created["order"].(map[string]any)["code"].(string)
	status, _, raw := call(t, app, http.MethodGet, "/api/orders/"+code, "", "")
	if status != 200 || strings.Contains(raw, "Ana Souza") || strings.Contains(raw, "Rua Secreta") || strings.Contains(raw, "98888") {
		t.Fatalf("status %d, leak: %s", status, raw)
	}
	if status, _, _ := call(t, app, http.MethodGet, "/api/orders/NAOEXISTE00", "", ""); status != 404 {
		t.Fatalf("missing order: %d", status)
	}
}

func TestAdminAuth(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	for _, token := range []string{"", "wrong"} {
		if status, _, _ := call(t, app, http.MethodGet, "/api/admin/orders", "", token); status != 401 {
			t.Fatalf("token %q: status %d", token, status)
		}
	}
	if status, _, _ := call(t, app, http.MethodGet, "/api/admin/orders", "", adminToken); status != 200 {
		t.Fatalf("valid token: status %d", status)
	}

	cfg := testConfig()
	cfg.AdminToken = ""
	off := newApp(t, cfg, DefaultOptions)
	if status, _, _ := call(t, off, http.MethodGet, "/api/admin/orders", "", ""); status != 503 {
		t.Fatalf("no token configured: status %d", status)
	}
}

func TestAdminSeesContactDataAndMovesStatus(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	_, created, _ := call(t, app, http.MethodPost, "/api/orders", validOrder, "")
	code := created["order"].(map[string]any)["code"].(string)

	_, _, raw := call(t, app, http.MethodGet, "/api/admin/orders", "", adminToken)
	if !strings.Contains(raw, "Ana Souza") || !strings.Contains(raw, "11988887777") {
		t.Fatalf("admin list: %s", raw)
	}
	path := "/api/admin/orders/" + code
	if status, _, _ := call(t, app, http.MethodPatch, path, `{"status":"completed"}`, adminToken); status != 409 {
		t.Fatalf("skipping steps: status %d", status)
	}
	for _, next := range []string{"accepted", "preparing", "ready", "completed"} {
		if status, _, raw := call(t, app, http.MethodPatch, path, `{"status":"`+next+`"}`, adminToken); status != 200 {
			t.Fatalf("%s: status %d: %s", next, status, raw)
		}
	}
	if status, _, _ := call(t, app, http.MethodPatch, path, `{"status":"cancelled"}`, adminToken); status != 409 {
		t.Fatalf("after completed: status %d", status)
	}
	_, public, _ := call(t, app, http.MethodGet, "/api/orders/"+code, "", "")
	if public["status"] != "completed" {
		t.Fatalf("public status %v", public["status"])
	}
}

func TestAdminItemChangesAffectOrders(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	path := "/api/admin/items/edamame"
	if status, _, _ := call(t, app, http.MethodPatch, path, `{"price_cents":2000}`, ""); status != 401 {
		t.Fatalf("anonymous: status %d", status)
	}
	if status, _, _ := call(t, app, http.MethodPatch, path, `{"price_cents":-1}`, adminToken); status != 422 {
		t.Fatalf("bad price: status %d", status)
	}
	if status, _, raw := call(t, app, http.MethodPatch, path, `{"price_cents":2000}`, adminToken); status != 204 {
		t.Fatalf("price: status %d: %s", status, raw)
	}
	_, body, _ := call(t, app, http.MethodPost, "/api/orders", validOrder, "")
	if body["order"].(map[string]any)["total_cents"] != float64(4000) {
		t.Fatalf("new price not used: %v", body["order"])
	}
	if status, _, raw := call(t, app, http.MethodPatch, path, `{"available":false}`, adminToken); status != 204 {
		t.Fatalf("availability: status %d: %s", status, raw)
	}
	if status, _, _ := call(t, app, http.MethodPost, "/api/orders", validOrder, ""); status != 409 {
		t.Fatalf("unavailable item: status %d", status)
	}
	if status, _, _ := call(t, app, http.MethodPatch, "/api/admin/items/nao-existe", `{"available":false}`, adminToken); status != 404 {
		t.Fatalf("unknown item: status %d", status)
	}
}

func TestOrdersAreRateLimited(t *testing.T) {
	app := newApp(t, testConfig(), Options{OrdersPerMinute: 2, AdminPerMinute: 100})
	for i := 0; i < 2; i++ {
		if status, _, _ := call(t, app, http.MethodPost, "/api/orders", validOrder, ""); status != 201 {
			t.Fatalf("request %d: status %d", i, status)
		}
	}
	if status, _, _ := call(t, app, http.MethodPost, "/api/orders", validOrder, ""); status != 429 {
		t.Fatalf("over limit: status %d", status)
	}
}

func TestAdminSetsItemImage(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	path := "/api/admin/items/edamame"
	for _, bad := range []string{"https://evil.example/a.jpg", "//evil.example/a.jpg", "/menu/../../a.jpg", "/menu/a.svg", "javascript:alert(1)"} {
		if status, _, raw := call(t, app, http.MethodPatch, path, `{"image":"`+bad+`"}`, adminToken); status != 422 {
			t.Fatalf("%s: status %d: %s", bad, status, raw)
		}
	}
	if status, _, raw := call(t, app, http.MethodPatch, path, `{"image":"/menu/edamame.jpg"}`, adminToken); status != 204 {
		t.Fatalf("valid image: status %d: %s", status, raw)
	}
	if _, _, raw := call(t, app, http.MethodGet, "/api/menu", "", ""); !strings.Contains(raw, `"image":"/menu/edamame.jpg"`) {
		t.Fatalf("image missing from menu: %s", raw)
	}
	// Changing another field keeps the photo; an empty value removes it.
	call(t, app, http.MethodPatch, path, `{"available":false}`, adminToken)
	if _, _, raw := call(t, app, http.MethodGet, "/api/menu", "", ""); !strings.Contains(raw, `"image":"/menu/edamame.jpg"`) {
		t.Fatalf("image lost on unrelated update: %s", raw)
	}
	if status, _, _ := call(t, app, http.MethodPatch, path, `{"image":""}`, adminToken); status != 204 {
		t.Fatalf("clear image: status %d", status)
	}
	if _, _, raw := call(t, app, http.MethodGet, "/api/menu", "", ""); strings.Contains(raw, "/menu/edamame.jpg") {
		t.Fatalf("image not cleared: %s", raw)
	}
}

type fakeNotifier struct {
	got chan notify.Message
	err error
}

func (f fakeNotifier) Send(_ context.Context, m notify.Message) error {
	f.got <- m
	return f.err
}

func TestOrderSendsMessageToCustomer(t *testing.T) {
	bot := fakeNotifier{got: make(chan notify.Message, 1), err: errors.New("bot offline")}
	app := newApp(t, testConfig(), Options{OrdersPerMinute: 20, AdminPerMinute: 20, Notifier: bot})

	// The bot is failing, and the order must go through anyway.
	status, body, raw := call(t, app, http.MethodPost, "/api/orders", validOrder, "")
	if status != 201 {
		t.Fatalf("status %d: %s", status, raw)
	}
	code := body["order"].(map[string]any)["code"].(string)
	select {
	case m := <-bot.got:
		if m.To != "5511988887777" {
			t.Fatalf("sent to %q", m.To)
		}
		for _, want := range []string{"Ana", code, "https://mrjapa.example/pedidos/" + code} {
			if !strings.Contains(m.Text, want) {
				t.Fatalf("message missing %q:\n%s", want, m.Text)
			}
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no message sent")
	}
}

func TestOrderStatusSteps(t *testing.T) {
	app := newApp(t, testConfig(), DefaultOptions)
	_, created, _ := call(t, app, http.MethodPost, "/api/orders", validOrder, "")
	order := created["order"].(map[string]any)
	if order["status"] != "new" {
		t.Fatalf("initial status %v", order["status"])
	}
	path := "/api/admin/orders/" + order["code"].(string)
	if status, _, _ := call(t, app, http.MethodPatch, path, `{"status":"preparing"}`, adminToken); status != 409 {
		t.Fatalf("preparing before accepted: status %d", status)
	}
}
