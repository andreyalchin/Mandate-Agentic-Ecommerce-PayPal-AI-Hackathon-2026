## Getting Started

1. Install the package from your project directory: `npm install @paypal/paypal-server-sdk@2.0.0`.
2. Configure the SDK environment; Sandbox is the default available environment.
3. Use the SDK’s supported controllers: Orders, Payments, Vault, Transaction Search, and Subscriptions.

```typescript
import {
  ApiError,
  Client,
  CustomError,
  Environment,
  LogLevel,
  PaymentsController,
} from '@paypal/paypal-server-sdk';

const client = new Client({
  clientCredentialsAuthCredentials: {
    clientId: 'OAuthClientId',
    clientSecret: 'OAuthClientSecret',
  },
  timeout: 0,
  environment: Environment.Sandbox,
  logging: {
    logLevel: LogLevel.Info,
    logRequest: {
      logBody: true,
    },
    logResponse: {
      logHeaders: true,
    },
  },
});

const paymentsController = new PaymentsController(client);

const collect = {
  captureId: 'capture_id2',
  paypalRequestId: 'idempotency-key',
  prefer: 'return=minimal',
  // An empty payload requests a full refund.
  body: {},
};

try {
  const response = await paymentsController.refundCapturedPayment(collect);

  console.log('Status code:', response.statusCode);
  console.log('Headers:', response.headers);
  console.log('Body:', response.body);

  if (response.result) {
    const refund = response.result;

    if (refund.id !== undefined) {
      console.log('Refund ID:', refund.id);
    }

    if (refund.status !== undefined) {
      console.log('Refund status:', refund.status);
    }

    if (refund.amount !== undefined) {
      console.log('Refund amount:', refund.amount);
    }

    if (refund.links !== undefined) {
      console.log('HATEOAS links:', refund.links);
    }
  }
} catch (error) {
  if (error instanceof CustomError) {
    console.log('PayPal client error status:', error.statusCode);
    console.log('Error details:', error.result);
    console.log('Error headers:', error.headers);
    console.log('Error body:', error.body);

    switch (error.statusCode) {
      case 400:
        console.log('Handle a malformed or syntactically invalid request.');
        break;
      case 401:
        console.log('Handle missing or invalid authentication credentials.');
        break;
      case 403:
        console.log('Handle insufficient permissions.');
        break;
      case 404:
        console.log('Handle a captured payment that does not exist.');
        break;
      case 409:
        console.log('Handle a refund request already in progress.');
        break;
      case 422:
        console.log('Handle failed business validation.');
        break;
    }
  } else if (error instanceof ApiError) {
    console.log('PayPal API error status:', error.statusCode);
    console.log('Error headers:', error.headers);
    console.log('Error body:', error.body);

    if (error.statusCode === 500) {
      console.log('Handle an internal server error.');
    }
  } else {
    console.log('Handle an unexpected error:', error);
  }
}
```

## Explanation

- The `PaymentsController` calls `refundCapturedPayment` for the captured payment identified by `captureId`.
- The empty `body` requests a full refund instead of a partial refund.
- `paypalRequestId` supplies the idempotency key.
- `CustomError` handling covers HTTP `400`, `401`, `403`, `404`, `409`, and `422` errors.
- `ApiError` handling covers the documented HTTP `500` internal server error.
- Response properties such as `id`, `status`, `amount`, and `links` are accessed only after checking that each optional property is defined.

---

## References

### Endpoints

- [RefundCapturedPayment](https://www.paypalobjects.com/serversdk/typescript/api-endpoints/payments/refund-captured-payment)

### Models

- [RefundRequest](https://www.paypalobjects.com/serversdk/typescript/models/structures/refund-request)
- [Refund](https://www.paypalobjects.com/serversdk/typescript/models/structures/refund)

### Getting Started

- [Getting Started](https://www.paypalobjects.com/serversdk/typescript/getting-started#environments)

Good luck with the integration
