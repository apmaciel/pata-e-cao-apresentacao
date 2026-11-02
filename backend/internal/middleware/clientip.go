package middleware

import (
	"net"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
)

// HeaderIPExtractor devolve um echo.IPExtractor que lê o IP do cliente de um
// header escrito pelo proxy de borda (ex.: CF-Connecting-IP no Cloudflare), em
// vez de confiar no X-Forwarded-For, que o cliente consegue forjar. Sem o
// header, ou com um valor que não é um IP, usa o endereço da conexão.
//
// Só use quando o backend for alcançável apenas pelo proxy: quem conecta
// direto também consegue forjar este header.
func HeaderIPExtractor(header string) echo.IPExtractor {
	direct := echo.ExtractIPDirect()
	return func(r *http.Request) string {
		if ip := strings.TrimSpace(r.Header.Get(header)); net.ParseIP(ip) != nil {
			return ip
		}
		return direct(r)
	}
}
