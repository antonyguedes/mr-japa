// Package notify holds the messages sent to customers over WhatsApp.
package notify

import (
	"context"
	"fmt"
	"strings"

	"github.com/devguedes/mr-japa/server/internal/store"
)

// Message is a WhatsApp text for one customer. To has country code and DDD, digits only.
type Message struct {
	To   string
	Text string
}

// Notifier delivers messages to customers. The WhatsApp bot will implement it.
type Notifier interface {
	Send(ctx context.Context, m Message) error
}

// None is used while there is no bot: messages are dropped.
type None struct{}

func (None) Send(context.Context, Message) error { return nil }

// OrderPlaced is the message sent right after an order is made.
func OrderPlaced(o store.Order, siteURL string) Message {
	text := fmt.Sprintf(`Olá, %s! 🍣

O seu pedido no Mr Japa foi feito com sucesso. Obrigado pela preferência!

Código do pedido: %s
Acompanhe o status: %s/pedidos/%s

一期一会`, strings.Fields(o.CustomerName)[0], o.Code, siteURL, o.Code)
	return Message{To: whatsappNumber(o.CustomerPhone), Text: text}
}

// whatsappNumber adds Brazil's country code to numbers typed with only the DDD.
func whatsappNumber(phone string) string {
	if len(phone) <= 11 {
		return "55" + phone
	}
	return phone
}
