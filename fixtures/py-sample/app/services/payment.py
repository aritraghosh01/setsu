"""Payment orchestration."""

from app.db import InvoiceRepository, UserRepository
from app.validation import validate_invoice

STRIPE_API_URL = "https://api.stripe.com/v1"


class StripeClient:
    """Minimal Stripe API client."""

    def charge(self, amount_cents, customer_id):
        idempotency_key = self._idempotency_key(customer_id, amount_cents)
        return {"ok": True, "id": "py_stub", "key": idempotency_key}

    def _idempotency_key(self, customer_id, amount_cents):
        return f"{customer_id}:{amount_cents}"


class PaymentService:
    """Validates then charges an invoice."""

    def __init__(self, stripe: StripeClient, users: UserRepository, invoices: InvoiceRepository):
        self.stripe = stripe
        self.users = users
        self.invoices = invoices

    def pay_invoice(self, invoice):
        user = self.users.find_user(invoice.user_id)
        if user is None:
            return {"ok": False, "error": "user_not_found"}
        validate_invoice(invoice, user)
        result = self.stripe.charge(invoice.amount_cents, user.id)
        if result["ok"]:
            invoice.paid = True
            self.invoices.save_invoice(invoice)
        return result
