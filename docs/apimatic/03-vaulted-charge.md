## Getting Started

1. Install the package from your project directory by running `npm install @paypal/paypal-server-sdk@2.0.0`.
2. Configure the SDK to use an environment for API calls; Sandbox is the default available environment.

The following example creates an order using a saved PayPal wallet vault payment token, then captures it without buyer interaction. Replace the vault ID with the saved PayPal wallet `vault_id`.

```typescript
import {
  ApiError,
  CheckoutPaymentIntent,
  Client,
  CustomError,
  Environment,
  LogLevel,
  OrderStatus,
  OrdersController,
} from '@paypal/paypal-server-sdk';

const client = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: 'OAuthClientId',
    oAuthClientSecret: 'OAuthClientSecret',
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

const ordersController = new OrdersController(client);

const createOrderRequest = {
  body: {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [
      {
        amount: {
          currencyCode: 'currency_code6',
          value: 'value0',
        },
      },
    ],
    paymentSource: {
      paypal: {
        vaultId: 'vault_id',
      },
    },
  },
  paypalRequestId: 'create-order-request-id',
  prefer: 'return=minimal',
};

try {
  const createResponse = await ordersController.createOrder(createOrderRequest);

  if (createResponse.result) {
    console.log('Created order:', createResponse.result);

    if (createResponse.result.status === OrderStatus.PayerActionRequired) {
      console.log(
        'PAYER_ACTION_REQUIRED: PayPal requires payer action; do not capture this order yet.',
      );
    } else if (createResponse.result.id) {
      const captureResponse = await ordersController.captureOrder({
        id: createResponse.result.id,
        paypalRequestId: 'capture-order-request-id',
        prefer: 'return=minimal',
      });

      if (captureResponse.result) {
        console.log('Captured order:', captureResponse.result);
      } else {
        console.log('The capture response did not include an order result.');
      }

      console.log('Capture status code:', captureResponse.statusCode);
      console.log('Capture headers:', captureResponse.headers);
      console.log('Capture body:', captureResponse.body);
    } else {
      console.log('The create response did not include an order ID.');
    }
  } else {
    console.log('The create response did not include an order result.');
  }

  console.log('Create status code:', createResponse.statusCode);
  console.log('Create headers:', createResponse.headers);
  console.log('Create body:', createResponse.body);
} catch (error) {
  if (error instanceof ApiError) {
    console.log('Error status code:', error.statusCode);
    console.log('Error headers:', error.headers);
    console.log('Error body:', error.body);

    if (error instanceof CustomError) {
      console.log('PayPal error result:', error.result);
    }
  } else {
    console.log('Unexpected error:', error);
  }
}
```

## Explanation

- The SDK is configured for the Sandbox environment using the verified SDK version `2.0.0`.
- `paymentSource.paypal.vaultId` identifies the saved PayPal wallet payment token.
- `CheckoutPaymentIntent.Capture` creates the order for capture.
- `paypalRequestId` is supplied to both endpoint calls for idempotency.
- The order ID returned by `createOrder` is passed directly to `captureOrder`.
- The code checks `response.result` before reading response properties from it.
- If the created order status is `PAYER_ACTION_REQUIRED`, the code stops before capture and reports that buyer action is required.
- API failures are handled through `ApiError`, with additional details logged for `CustomError`.

---

## References

### Endpoints

- [CaptureOrder](https://www.paypalobjects.com/serversdk/typescript/api-endpoints/orders/capture-order)
- [CreateOrder](https://www.paypalobjects.com/serversdk/typescript/api-endpoints/orders/create-order)
- [ConfirmOrder](https://www.paypalobjects.com/serversdk/typescript/api-endpoints/orders/confirm-order)

### Models

- [OrderRequest](https://www.paypalobjects.com/serversdk/typescript/models/structures/order-request)
- [OrderCaptureRequest](https://www.paypalobjects.com/serversdk/typescript/models/structures/order-capture-request)
- [Order](https://www.paypalobjects.com/serversdk/typescript/models/structures/order)

### Getting Started

- [Getting Started](https://www.paypalobjects.com/serversdk/typescript/getting-started#environments)

Good luck with the integration
