// Package store persists the menu and the orders in SQLite.
package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed seed/menu.json
var seedMenu []byte

var (
	ErrNotFound          = errors.New("not found")
	ErrInvalidTransition = errors.New("invalid status transition")
)

// UnavailableItemError reports a cart line that can no longer be ordered.
type UnavailableItemError struct{ ItemID string }

func (e UnavailableItemError) Error() string { return "item unavailable: " + e.ItemID }

const schema = `
CREATE TABLE IF NOT EXISTS categories (
	id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ja TEXT NOT NULL, position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
	id TEXT PRIMARY KEY,
	category_id TEXT NOT NULL REFERENCES categories(id),
	name TEXT NOT NULL, name_ja TEXT NOT NULL, description TEXT NOT NULL,
	price_cents INTEGER NOT NULL CHECK (price_cents > 0),
	available INTEGER NOT NULL DEFAULT 1,
	position INTEGER NOT NULL,
	image TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS orders (
	code TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	channel TEXT NOT NULL,
	fulfillment TEXT NOT NULL,
	payment_method TEXT NOT NULL,
	customer_name TEXT NOT NULL,
	customer_phone TEXT NOT NULL,
	address TEXT NOT NULL,
	notes TEXT NOT NULL,
	subtotal_cents INTEGER NOT NULL,
	delivery_fee_cents INTEGER NOT NULL,
	total_cents INTEGER NOT NULL,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_created_at ON orders(created_at);
CREATE TABLE IF NOT EXISTS order_items (
	order_code TEXT NOT NULL REFERENCES orders(code) ON DELETE CASCADE,
	item_id TEXT NOT NULL,
	name TEXT NOT NULL,
	quantity INTEGER NOT NULL,
	unit_price_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_code);
`

type Store struct{ db *sql.DB }

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	// SQLite allows one writer; a single connection also keeps the pragmas consistent.
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("schema: %w", err)
	}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if err := s.seed(); err != nil {
		db.Close()
		return nil, fmt.Errorf("seed: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

// migrate upgrades databases created before a column existed.
func (s *Store) migrate() error {
	var hasImage int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('items') WHERE name = 'image'`).Scan(&hasImage)
	if err != nil || hasImage > 0 {
		return err
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN image TEXT NOT NULL DEFAULT ''`)
	return err
}

// seed fills an empty menu from seed/menu.json. Existing data is never touched.
func (s *Store) seed() error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM categories`).Scan(&count); err != nil || count > 0 {
		return err
	}
	var menu struct {
		Categories []struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			NameJa string `json:"name_ja"`
			Items  []Item `json:"items"`
		} `json:"categories"`
	}
	if err := json.Unmarshal(seedMenu, &menu); err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, c := range menu.Categories {
		if _, err := tx.Exec(`INSERT INTO categories (id, name, name_ja, position) VALUES (?, ?, ?, ?)`, c.ID, c.Name, c.NameJa, i); err != nil {
			return err
		}
		for j, it := range c.Items {
			if _, err := tx.Exec(
				`INSERT INTO items (id, category_id, name, name_ja, description, price_cents, position, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				it.ID, c.ID, it.Name, it.NameJa, it.Description, it.PriceCents, j, it.Image,
			); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

type Item struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	NameJa      string `json:"name_ja"`
	Description string `json:"description"`
	PriceCents  int    `json:"price_cents"`
	Available   bool   `json:"available"`
	Image       string `json:"image"`
}

type Category struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	NameJa string `json:"name_ja"`
	Items  []Item `json:"items"`
}

type Menu struct {
	Categories []Category `json:"categories"`
}

func (s *Store) Menu(ctx context.Context) (Menu, error) {
	menu := Menu{Categories: []Category{}}
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.name, c.name_ja, i.id, i.name, i.name_ja, i.description, i.price_cents, i.available, i.image
		FROM categories c JOIN items i ON i.category_id = c.id
		ORDER BY c.position, i.position`)
	if err != nil {
		return menu, err
	}
	defer rows.Close()
	for rows.Next() {
		var c Category
		var it Item
		if err := rows.Scan(&c.ID, &c.Name, &c.NameJa, &it.ID, &it.Name, &it.NameJa, &it.Description, &it.PriceCents, &it.Available, &it.Image); err != nil {
			return menu, err
		}
		if n := len(menu.Categories); n == 0 || menu.Categories[n-1].ID != c.ID {
			c.Items = []Item{}
			menu.Categories = append(menu.Categories, c)
		}
		last := &menu.Categories[len(menu.Categories)-1]
		last.Items = append(last.Items, it)
	}
	return menu, rows.Err()
}

// UpdateItem changes the price, availability and/or photo of a menu item.
func (s *Store) UpdateItem(ctx context.Context, id string, priceCents *int, available *bool, image *string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE items SET price_cents = COALESCE(?, price_cents), available = COALESCE(?, available), image = COALESCE(?, image) WHERE id = ?`,
		priceCents, available, image, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

const (
	StatusNew            = "new"
	StatusAccepted       = "accepted"
	StatusPreparing      = "preparing"
	StatusReady          = "ready"
	StatusOutForDelivery = "out_for_delivery"
	StatusCompleted      = "completed"
	StatusCancelled      = "cancelled"
)

var transitions = map[string][]string{
	StatusNew:            {StatusAccepted, StatusCancelled},
	StatusAccepted:       {StatusPreparing, StatusCancelled},
	StatusPreparing:      {StatusReady, StatusOutForDelivery, StatusCancelled},
	StatusReady:          {StatusOutForDelivery, StatusCompleted, StatusCancelled},
	StatusOutForDelivery: {StatusCompleted, StatusCancelled},
}

type OrderItem struct {
	ItemID         string `json:"-"`
	Name           string `json:"name"`
	Quantity       int    `json:"quantity"`
	UnitPriceCents int    `json:"unit_price_cents"`
}

// Order holds customer data, so the API only sends the whole struct to the admin panel.
type Order struct {
	Code             string      `json:"code"`
	Status           string      `json:"status"`
	Channel          string      `json:"channel"`
	Fulfillment      string      `json:"fulfillment"`
	PaymentMethod    string      `json:"payment_method"`
	CustomerName     string      `json:"customer_name"`
	CustomerPhone    string      `json:"customer_phone"`
	Address          string      `json:"address"`
	Notes            string      `json:"notes"`
	SubtotalCents    int         `json:"subtotal_cents"`
	DeliveryFeeCents int         `json:"delivery_fee_cents"`
	TotalCents       int         `json:"total_cents"`
	CreatedAt        string      `json:"created_at"`
	Items            []OrderItem `json:"items"`
}

// NewOrder is a validated order request. Lines map item IDs to quantities; prices
// always come from the database, never from the client.
type NewOrder struct {
	Channel, Fulfillment, PaymentMethod string
	CustomerName, CustomerPhone         string
	Address, Notes                      string
	DeliveryFeeCents                    int
	Lines                               map[string]int
}

func (s *Store) CreateOrder(ctx context.Context, in NewOrder) (Order, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Order{}, err
	}
	defer tx.Rollback()

	o := Order{
		Code: newCode(), Status: StatusNew, Channel: in.Channel, Fulfillment: in.Fulfillment,
		PaymentMethod: in.PaymentMethod, CustomerName: in.CustomerName, CustomerPhone: in.CustomerPhone,
		Address: in.Address, Notes: in.Notes, DeliveryFeeCents: in.DeliveryFeeCents,
		CreatedAt: time.Now().UTC().Format(time.RFC3339), Items: []OrderItem{},
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT i.id, i.name, i.price_cents, i.available FROM items i
		JOIN categories c ON c.id = i.category_id ORDER BY c.position, i.position`)
	if err != nil {
		return Order{}, err
	}
	found := map[string]bool{}
	for rows.Next() {
		var line OrderItem
		var available bool
		if err := rows.Scan(&line.ItemID, &line.Name, &line.UnitPriceCents, &available); err != nil {
			rows.Close()
			return Order{}, err
		}
		qty, wanted := in.Lines[line.ItemID]
		if !wanted {
			continue
		}
		if !available {
			rows.Close()
			return Order{}, UnavailableItemError{line.ItemID}
		}
		found[line.ItemID] = true
		line.Quantity = qty
		o.Items = append(o.Items, line)
		o.SubtotalCents += qty * line.UnitPriceCents
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Order{}, err
	}
	for id := range in.Lines {
		if !found[id] {
			return Order{}, UnavailableItemError{id}
		}
	}
	o.TotalCents = o.SubtotalCents + o.DeliveryFeeCents

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO orders (code, status, channel, fulfillment, payment_method, customer_name, customer_phone,
			address, notes, subtotal_cents, delivery_fee_cents, total_cents, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		o.Code, o.Status, o.Channel, o.Fulfillment, o.PaymentMethod, o.CustomerName, o.CustomerPhone,
		o.Address, o.Notes, o.SubtotalCents, o.DeliveryFeeCents, o.TotalCents, o.CreatedAt); err != nil {
		return Order{}, err
	}
	for _, line := range o.Items {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO order_items (order_code, item_id, name, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)`,
			o.Code, line.ItemID, line.Name, line.Quantity, line.UnitPriceCents); err != nil {
			return Order{}, err
		}
	}
	return o, tx.Commit()
}

const orderColumns = `code, status, channel, fulfillment, payment_method, customer_name, customer_phone,
	address, notes, subtotal_cents, delivery_fee_cents, total_cents, created_at`

func scanOrder(row interface{ Scan(...any) error }) (Order, error) {
	var o Order
	err := row.Scan(&o.Code, &o.Status, &o.Channel, &o.Fulfillment, &o.PaymentMethod, &o.CustomerName, &o.CustomerPhone,
		&o.Address, &o.Notes, &o.SubtotalCents, &o.DeliveryFeeCents, &o.TotalCents, &o.CreatedAt)
	return o, err
}

func (s *Store) Order(ctx context.Context, code string) (Order, error) {
	o, err := scanOrder(s.db.QueryRowContext(ctx, `SELECT `+orderColumns+` FROM orders WHERE code = ?`, code))
	if errors.Is(err, sql.ErrNoRows) {
		return Order{}, ErrNotFound
	}
	if err != nil {
		return Order{}, err
	}
	o.Items, err = s.orderItems(ctx, code)
	return o, err
}

// RecentOrders returns the latest orders, newest first.
func (s *Store) RecentOrders(ctx context.Context, limit int) ([]Order, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+orderColumns+` FROM orders ORDER BY created_at DESC, rowid DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	orders := []Order{}
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		orders = append(orders, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Only after closing rows: the pool has a single connection.
	for i := range orders {
		if orders[i].Items, err = s.orderItems(ctx, orders[i].Code); err != nil {
			return nil, err
		}
	}
	return orders, nil
}

func (s *Store) orderItems(ctx context.Context, code string) ([]OrderItem, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT item_id, name, quantity, unit_price_cents FROM order_items WHERE order_code = ? ORDER BY rowid`, code)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []OrderItem{}
	for rows.Next() {
		var it OrderItem
		if err := rows.Scan(&it.ItemID, &it.Name, &it.Quantity, &it.UnitPriceCents); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// SetStatus moves an order forward, rejecting transitions the workflow does not allow.
func (s *Store) SetStatus(ctx context.Context, code, status string) (Order, error) {
	current, err := s.Order(ctx, code)
	if err != nil {
		return Order{}, err
	}
	allowed := false
	for _, next := range transitions[current.Status] {
		allowed = allowed || next == status
	}
	if !allowed {
		return Order{}, ErrInvalidTransition
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE orders SET status = ? WHERE code = ?`, status, code); err != nil {
		return Order{}, err
	}
	current.Status = status
	return current, nil
}

// newCode returns an unguessable order code: it is the only credential on the tracking page.
func newCode() string {
	const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}
