"""Entry point wiring routes to services."""

from app.routes import build_services, handle_login, handle_pay

APP_NAME = "py-sample"


def main():
    payment, auth = build_services()
    print(APP_NAME, payment, auth, handle_pay, handle_login)
