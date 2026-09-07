# ts-sample

Golden-test fixture repository for SETSU. A miniature e-commerce backend with
the architecture shape used throughout the spec examples:

`CheckoutController → CheckoutService → PaymentGateway → StripeAdapter`

Do not reformat or restructure casually — golden tests assert exact symbols,
relations, and line numbers extracted from these files.
