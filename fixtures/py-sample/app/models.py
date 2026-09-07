"""Domain models for the py-sample billing service."""

from dataclasses import dataclass
from enum import Enum


class CustomerStatus(Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"


@dataclass
class User:
    id: str
    email: str
    status: CustomerStatus


@dataclass
class Invoice:
    id: str
    user_id: str
    amount_cents: int
    paid: bool = False
