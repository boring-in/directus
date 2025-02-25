import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { CustomerData, ProductJson, SalesChannel, ShippingAddress, WooCommerceOrderLineItem } from "./types";
import Customer from "../Customer";
import Order from "../Order";
import Product from "../Product";
import Log from "../Log";

export class OrderSync {
  private api: WooCommerceRestApi;
  private salesChannel: SalesChannel;
  private ItemsService: any;
  private schema: any;
  private orderService: any;
  private orderStatusMapService: any;

  constructor(
    api: WooCommerceRestApi,
    salesChannel: SalesChannel,
    ItemsService: any,
    schema: any,
    orderService: any,
    orderStatusMapService: any
  ) {
    this.api = api;
    this.salesChannel = salesChannel;
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.orderService = orderService;
    this.orderStatusMapService = orderStatusMapService;
  }

  /**
   * Creates an order in the system from WooCommerce order
   */
  async createOrder(orderId: string): Promise<void> {
    if (!this.salesChannel) {
      throw new Error('Sales channel is not defined');
    }

    const orderInfo = await this.api.get(`orders/${orderId}`);
    const orderMain = orderInfo.data;
    const orderedProducts = orderMain.line_items as WooCommerceOrderLineItem[];
    Log.toFile('orderInfo.txt', "", orderMain);

    if (!orderMain.billing) {
      throw new Error('Order billing information is missing');
    }

    const customerData: CustomerData = {
      id: '',  // Will be set by Customer class
      email: orderMain.billing.email || '',
      first_name: orderMain.billing.first_name || '',
      last_name: orderMain.billing.last_name || '',
      sales_channel: this.salesChannel.id,
      phone: '',
      phone_mobile: ''
    };
    const cst = new Customer(
      Number(this.salesChannel.id),
      orderMain.billing.first_name,
      orderMain.billing.last_name,
      orderMain.billing.email,
      orderMain.billing.country,
      orderMain.billing.city,
      orderMain.billing.address_1,
      orderMain.billing.postcode,
      "",  // phone
      "",  // mobile phone,
      "",
      this.ItemsService,
      this.schema // parent customer
    );

    const customer = await cst.getCustomer();
    const productJsonArray: ProductJson[] = [];

    for (let i = 0; i < orderedProducts.length; i++) {
      try {
        console.log(`Processing order product ${i + 1}:`, orderedProducts[i]);

        const orderProduct = orderedProducts[i];
        if (!orderProduct) {
          console.error(`Invalid order product at index ${i}`);
          continue;
        }

        const wcVariationId = orderProduct.variation_id?.toString() || '';
        const wcProductId = orderProduct.product_id?.toString();
        
        if (!wcProductId) {
          console.error(`Missing product_id for order product ${i + 1}`);
          continue;
        }

        const searchableId = wcVariationId === '' || wcVariationId === '0' ? wcProductId : wcVariationId;
        console.log(`Using searchable ID: ${searchableId}`);

        const productData = await this.api.get(`products/${searchableId}`);
        const parentProductData = await this.api.get(`products/${wcProductId}`);

        console.log(`Product data retrieved for ID ${searchableId}`);

        const attributes = [];
        if (productData.data.attributes) {
          for (let x = 0; x < productData.data.attributes.length; x++) {
            const orderedProductAttribute = productData.data.attributes[x];
            const attributeData = await this.api.get(
              `products/attributes/${orderedProductAttribute.id}`
            );
            const attributeInfo = attributeData.data;
            const value =
              orderedProductAttribute.option === undefined
                ? 0
                : orderedProductAttribute.option;
            const attributeJson = {
              name: attributeInfo.name,
              slug: attributeInfo.slug,
              value: value,
            };
            attributes[x] = attributeJson;
          }
        }

        if (!orderProduct.quantity || typeof orderProduct.total !== 'string') {
          console.error(`Missing required fields for order product ${i + 1}`);
          continue;
        }

        // Calculate effective tax rate
        const total = parseFloat(orderProduct.total || '0');
        const totalTax = parseFloat(orderProduct.total_tax || '0');
        let taxRate = 0;

        if (total > 0) {
          // Calculate effective tax rate as percentage
          taxRate = (totalTax / total) * 100;
        } else if (orderProduct.taxes && Array.isArray(orderProduct.taxes) && orderProduct.taxes.length > 0) {
          // If total is 0 but we have tax info, sum up tax rates
          taxRate = orderProduct.taxes.reduce((sum: number, tax: { total: string }) => {
            return sum + parseFloat(tax.total || '0');
          }, 0);
        }
        
        const productJson: ProductJson = {
          externalId: searchableId,
          parentId: wcProductId,
          name: parentProductData.data.name,
          sku: productData.data.sku,
          parent_sku: parentProductData.data.sku,
          brand: parentProductData.data.brand || '',
          is_parent: false,
          attributes: attributes,
          quantity: orderProduct.quantity,
          total: Number(total.toFixed(2)),
          tax_rate: taxRate
        };

        console.log(`Created ProductJson:`, productJson);
        productJsonArray.push(productJson);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to process order product ${i + 1}:`, error);
        console.error('Error details:', errorMessage);
        continue;
      }
    }

    const prdct = new Product(this.ItemsService, this.schema);
    const enrichedProducts = await prdct.getProductsForOrder(this.salesChannel.id, productJsonArray);

    const shippingAddress: ShippingAddress = {
      country: orderInfo.data.shipping.country,
      city: orderInfo.data.shipping.city,
      address: orderInfo.data.shipping.address_1,
      postcode: orderInfo.data.shipping.postcode,
    };

    const statusMapItem = await this.orderStatusMapService.readByQuery({
      filter: {
        _and: [{ sales_channel: this.salesChannel.id }, { sales_channel_order_status: orderMain.status }]
      }
    });

    if (!statusMapItem || statusMapItem.length === 0) {
      throw new Error('Status mapping not found');
    }

    const status = statusMapItem[0].order_status;

    const ordr = new Order(
      orderMain.id.toString(),
      {
        id: this.salesChannel.id
      },
      orderMain.date_created,
      enrichedProducts,
      status,
      customer as any,
      orderMain.shipping_method || 'standard',
      orderMain.shipping_tax || 0,
      orderMain.shipping_total || 0,
      orderMain.total,
      orderMain.discount_total,
      orderMain.total,
      orderMain.payment_method_title || 'standard',
      shippingAddress,
      this.ItemsService,
      this.schema
    );
    await ordr.createOrder();
  }

  /**
   * Updates local order status
   */
  async localOrderStatusUpdate(orderId: string, statusName: string): Promise<void> {
    if (!this.salesChannel) {
      throw new Error('Sales channel is not defined');
    }

    const mappedStatus = await this.orderStatusMapService.readByQuery({
      filter: {
        _and: [{ sales_channel_order_status: statusName }, { sales_channel: this.salesChannel.id }]
      }
    });

    if (!mappedStatus || mappedStatus.length === 0) {
      throw new Error('Status mapping not found');
    }

    const statusId = mappedStatus[0].order_status;
    await Order.updateOrder(orderId, statusId, this.salesChannel.id, this.ItemsService, this.schema);
  }

  /**
   * Updates order status in WooCommerce
   */
  async outsideOrderStatusUpdate(orderId: string, statusId: string): Promise<void> {
    if (!this.salesChannel) {
      throw new Error('Sales channel is not defined');
    }

    const mappedStatus = await this.orderStatusMapService.readByQuery({
      filter: {
        _and: [{ order_status: statusId }, { sales_channel: this.salesChannel.id }, { bothway_sync: true }]
      }
    });

    if (mappedStatus && mappedStatus.length > 0) {
      const status = mappedStatus[0].sales_channel_order_status;
      const orderInfo = await Order.getOrder(orderId, this.ItemsService, this.schema);
      if (orderInfo && orderInfo.sales_channel_order_id) {
        await this.api.put(`orders/${orderInfo.sales_channel_order_id}`, { status: status });
      }
    }
  }
}

