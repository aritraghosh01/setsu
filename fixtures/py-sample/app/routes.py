"""HTTP route handlers."""

from app.db import InvoiceRepository, UserRepository
from app.services.auth import AuthService
from app.services.payment import PaymentService, StripeClient


def build_services():
    users = UserRepository()
    invoices = InvoiceRepository()
    payment = PaymentService(StripeClient(), users, invoices)
    auth = AuthService(users)
    return payment, auth


def handle_pay(payment: PaymentService, invoice):
    result = payment.pay_invoice(invoice)
    status = 200 if result["ok"] else 402
    return status, result


def handle_login(auth: AuthService, email, password):
    session = auth.authenticate(email, password)
    if session is None:
        return 401, {}
    return 200, session
