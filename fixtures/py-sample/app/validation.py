"""Invoice validation rules."""

from app.models import CustomerStatus, Invoice, User


class ValidationError(Exception):
    pass


def validate_invoice(invoice: Invoice, user: User):
    """Suspended or closed customers must never be billed."""
    if user.status != CustomerStatus.ACTIVE:
        raise ValidationError(f"customer {user.id} is {user.status.value}")
    if invoice.amount_cents <= 0:
        raise ValidationError("invoice amount must be positive")
