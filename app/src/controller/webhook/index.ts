import { RequestHandler } from 'express';
import shopline from '../../shopline';

export const webhooksController: () => RequestHandler = () => async (_req, res) => {
  try {
    const data = await shopline.webhookAuthentication(_req);
    const { topic, session, payload } = data;
    console.log('webhooks', topic, payload);

    switch (topic) {
      case 'apps/installed_uninstalled':
        if (session) {
          await shopline.config.sessionStorage.deleteSession(session.id);
        }
        break;
      case 'products/create':
        console.log('products/create');
        break;
      case 'customers/data_request':
        // GDPR: acknowledge customer data request; no personal data stored by this app
        console.log('customers/data_request', payload);
        break;
      case 'customers/redact':
        // GDPR: delete any stored customer data associated with payload.customer.id
        console.log('customers/redact', payload);
        break;
      case 'merchants/redact':
        // GDPR: delete all stored merchant data associated with payload.shop_id
        console.log('merchants/redact', payload);
        break;
      default:
        throw new Response('Unhandled webhook topic', { status: 404 });
    }
    res.status(200).send({ success: true, data });
  } catch (error) {
    console.log('webhooks error', error);
    res.status(error.status).send({ success: false, statusText: error.statusText });
  }
};
