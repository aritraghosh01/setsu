from app.db import InvoiceRepository, UserRepository
from app.models import CustomerStatus, Invoice, User
from app.services.payment import PaymentService, StripeClient


def test_pay_invoice_active_customer():
    users = UserRepository()
    users.save_user(User(id="u1", email="a@b.c", status=CustomerStatus.ACTIVE))
    service = PaymentService(StripeClient(), users, InvoiceRepository())
    result = service.pay_invoice(Invoice(id="i1", user_id="u1", amount_cents=100))
    assert result["ok"]
