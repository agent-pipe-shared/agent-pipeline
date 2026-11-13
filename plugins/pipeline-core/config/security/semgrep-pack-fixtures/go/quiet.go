package demo

import (
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func FindUser(db *sql.DB, name string) (*sql.Rows, error) {
	return db.Query("SELECT * FROM users WHERE name = $1", name)
}

func Count(db *sql.DB) *sql.Row {
	return db.QueryRow("SELECT count(*) FROM users " + "WHERE active")
}

func Greeting(name string) string {
	return fmt.Sprintf("select a product, %s", name)
}

func Build() error {
	if err := exec.Command("git", "status").Run(); err != nil {
		return err
	}
	return exec.Command("sh", "-c", "make build").Run()
}

func Client() *http.Client {
	return &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}}}
}

func ReadFile(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Query().Get("name"))
	data, _ := os.ReadFile(filepath.Join("/srv/files", name))
	w.Write(data)
}

func Item(w http.ResponseWriter, r *http.Request) {
	id := r.FormValue("id")
	resp, _ := http.Get("https://api.internal.example/items/" + id)
	defer resp.Body.Close()
}

func Digest(data []byte) [32]byte {
	return sha256.Sum256(data)
}

const base = "/srv/files/"

func Contained(w http.ResponseWriter, r *http.Request) {
	full := filepath.Clean(filepath.Join(base, r.URL.Query().Get("name")))
	if !strings.HasPrefix(full, base) {
		http.Error(w, "outside", http.StatusBadRequest)
		return
	}
	data, _ := os.ReadFile(full)
	w.Write(data)
}
