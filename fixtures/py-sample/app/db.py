"""In-memory repositories."""

from app.models import Invoice, User


class UserRepository:
    def __init__(self):
        self._users = {}

    def find_user(self, user_id):
        return self._users.get(user_id)

    def save_user(self, user: User):
        self._users[user.id] = user


class InvoiceRepository:
    def __init__(self):
        self._invoices = {}

    def find_invoice(self, invoice_id):
        return self._invoices.get(invoice_id)

    def save_invoice(self, invoice: Invoice):
        self._invoices[invoice.id] = invoice
