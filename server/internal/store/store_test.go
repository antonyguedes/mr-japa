package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

// A database from before the image column keeps its data and gains the column.
func TestOpenMigratesOldDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	old, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = old.Exec(`
		CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ja TEXT NOT NULL, position INTEGER NOT NULL);
		CREATE TABLE items (
			id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id),
			name TEXT NOT NULL, name_ja TEXT NOT NULL, description TEXT NOT NULL,
			price_cents INTEGER NOT NULL, available INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL
		);
		INSERT INTO categories VALUES ('c', 'Categoria', 'カ', 0);
		INSERT INTO items VALUES ('i', 'c', 'Prato', 'プ', 'Desc', 1234, 1, 0);`)
	old.Close()
	if err != nil {
		t.Fatal(err)
	}

	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	menu, err := s.Menu(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(menu.Categories) != 1 || menu.Categories[0].Items[0].PriceCents != 1234 || menu.Categories[0].Items[0].Image != "" {
		t.Fatalf("unexpected menu after migration: %+v", menu)
	}
}
