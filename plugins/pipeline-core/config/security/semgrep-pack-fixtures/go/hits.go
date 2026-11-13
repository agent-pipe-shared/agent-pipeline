package demo

import (
	"crypto/md5"
	"crypto/tls"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

func FindUser(db *sql.DB, name string) (*sql.Rows, error) {
	return db.Query(fmt.Sprintf("SELECT * FROM users WHERE name = '%s'", name))
}

func DeleteOrder(db *sql.DB, id string) error {
	q := "DELETE FROM orders WHERE id = " + id
	_, err := db.Exec(q)
	return err
}

func Ping(host string) error {
	return exec.Command("sh", "-c", "ping -c 1 "+host).Run()
}

func Client() *http.Client {
	return &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
}

func ReadFile(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	data, _ := os.ReadFile(filepath.Join("/srv/files", name))
	w.Write(data)
}

func Download(c *gin.Context) {
	c.File(c.Query("path"))
}

func Proxy(w http.ResponseWriter, r *http.Request) {
	target := r.FormValue("url")
	resp, _ := http.Get(target)
	defer resp.Body.Close()
}

func Digest(data []byte) [16]byte {
	return md5.Sum(data)
}
