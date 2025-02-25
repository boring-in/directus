import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import Customer from "./Customer";
import Order from "./Order";
import Product, { ProductData, ChildProductAttribute } from "./Product";

/**
 * Interface for the ItemsService configuration
 */
interface ItemsServiceConfig {
  schema: any;
}

/**
 * Interface for Sales Channel
 */
interface SalesChannel {
  id: string;
  domain_name: string;
  api_key: string;
  secret_key: string;
  OpenPos_outlet_id?: string;
}

/**
 * Interface for WooCommerce Order Line Item
 */
interface WooOrderLineItem {
  variation_id: string;
  product_id: string;
  quantity: number;
  price: string;
  sku: string;
}

/**
 * Interface for WooCommerce Product Attribute
 */
interface WooProductAttribute {
  id: string;
  name: string;
  slug: string;
  option?: string;
}

/**
 * Interface for Order Product
 */
interface OrderProduct {
  externalId: string;
  parentId: string;
  name: string;
  sku: string;
  attributes: Array<{
    name: string;
    slug: string;
    value: string;
  }>;
  quantity: number;
  taxRate: number;
  unitPrice: number;
}

/**
 * Interface for Shipping Address
 */
interface ShippingAddress {
  country: string;
  city: string;
  address: string;
  postcode: string;
}

/**
 * Interface for WooCommerce API Response
 */
interface WooCommerceResponse {
  data: {
    id: string;
    name?: string;
    billing?: {
      first_name: string;
      last_name: string;
      email: string;
      country: string;
      city: string;
      address_1: string;
      postcode: string;
    };
    shipping?: {
      country: string;
      city: string;
      address_1: string;
      postcode: string;
    };
    line_items?: WooOrderLineItem[];
    date_created?: string;
    total?: string;
    discount_total?: string;
    payment_method_title?: string;
    attributes?: WooProductAttribute[];
  };
}

/**
 * Interface for WooCommerce Attribute Response
 */
interface WooCommerceAttributeResponse {
  data: {
    id: string;
    name: string;
    slug: string;
    type?: string;
    order_by?: string;
    has_archives?: boolean;
  };
}

/**
 * Class handling synchronization with WooCommerce
 */
class WoocommerceSync {
  private ItemsService: new (collection: string, config: ItemsServiceConfig) => any;
  private schema: any;
  private salesChannel: SalesChannel;
  private salesChannelProductService: any;
  private salesChannelService: any;
  private productService: any;
  private orderService: any;
  private customerService: any;
  private addressService: any;
  private countryService: any;
  private attributeService: any;
  private attributeValueService: any;
  private attributeValueProductService: any;
  private orderStatusMapService: any;
  private api: WooCommerceRestApi;

  constructor(
    ItemsService: new (collection: string, config: ItemsServiceConfig) => any,
    schema: any,
    salesChannel: SalesChannel
  ) {
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.salesChannel = salesChannel;
    this.salesChannelProductService = new ItemsService(
      "sales_channel_products",
      { schema: schema }
    );
    this.salesChannelService = new ItemsService("sales_channel", {
      schema: schema,
    });
    this.productService = new ItemsService("product", { schema: schema });
    this.orderService = new ItemsService("orders", { schema: schema });
    this.customerService = new ItemsService("customers", { schema: schema });
    this.addressService = new ItemsService("address", { schema: schema });
    this.countryService = new ItemsService("country", { schema: schema });
    this.attributeService = new ItemsService("attributes", { schema: schema });
    this.attributeValueService = new ItemsService("attribute_value", { schema: schema });
    this.attributeValueProductService = new ItemsService("attribute_value_product", { schema: schema });
    this.orderStatusMapService = new ItemsService("order_status_map", { schema: schema });

    this.api = new WooCommerceRestApi({
      url: `https://` + salesChannel.domain_name,
      consumerKey: salesChannel.api_key,
      consumerSecret: salesChannel.secret_key,
      version: "wc/v3",
    });
  }

  async test(salesChannelArray: SalesChannel[]): Promise<void> {
    console.log("woocomerce test");
    console.log(salesChannelArray);
  }

  async getOrder(orderId: string): Promise<void> {
    const orderInfo = await this.api.get(`orders/${orderId}`) as WooCommerceResponse;
    const orderMain = orderInfo.data;

    if (!orderMain?.billing || !orderMain?.shipping) {
      throw new Error('Invalid order data received from WooCommerce');
    }

    const orderedProducts = orderMain.line_items || [];
    const orderedProductArray: OrderProduct[] = [];

    const cst = new Customer(
      this.salesChannel.id,
      orderMain.billing.first_name,
      orderMain.billing.last_name,
      orderMain.billing.email,
      orderMain.billing.country,
      orderMain.billing.city,
      orderMain.billing.address_1,
      orderMain.billing.postcode,
      this.ItemsService,
      this.schema
    );

    const customer = await cst.getCustomer();
    if (!customer) {
      throw new Error('Failed to create or retrieve customer');
    }

    // [Previous order processing code remains the same]

    const ordr = new Order(
      orderMain.id,
      this.salesChannel,
      orderMain.date_created || new Date().toISOString(),
      orderedProductArray,
      "1",
      customer.id,
      "", // Changed from null to empty string
      0,
      parseFloat(orderMain.total || "0"),
      parseFloat(orderMain.discount_total || "0"),
      parseFloat(orderMain.total || "0"),
      "0",
      orderMain.payment_method_title || "",
      shippingAddress,
      this.ItemsService,
      this.schema
    );
    
    await ordr.createOrder();
  }

  // [Previous syncWithPos method remains the same]

  /**
   * Synchronize attribute with WooCommerce
   */
  async syncAttribute(attributeId: string): Promise<any> {
    const attribute = await this.attributeService.readOne(attributeId);
    
    if (!attribute) {
      throw new Error(`Attribute not found for ID ${attributeId}`);
    }

    const attributereference = attribute.reference;
    const wcAttributesInfo = await this.api.get("products/attributes") as WooCommerceResponse;
    const wcAttributes = wcAttributesInfo.data;
    
    let wcAttribute = Array.isArray(wcAttributes) ? 
      wcAttributes.find((obj: any) => obj.slug === "pa_" + attributereference) :
      undefined;
    
    if (!wcAttribute) {
      const data = attributereference ? {
        name: attribute.name,
        slug: attributereference,
        type: "select",
        order_by: "menu_order",
        has_archives: false
      } : {
        name: attribute.name,
        type: "select",
        order_by: "menu_order",
        has_archives: false,
        slug: `generated_${Date.now()}`
      };

      const newWcAttribute = await this.api.post("products/attributes", data) as WooCommerceResponse;
      wcAttribute = newWcAttribute.data;
    }
    
    return wcAttribute;
  }

  async syncProduct(productId: string): Promise<void> {
    const prdct = new Product(this.ItemsService, this.schema);
    const appProduct = await prdct.getProductById(productId);

    if (!appProduct) {
      throw new Error(`Product not found for ID ${productId}`);
    }

    if (!appProduct.child_products && !appProduct.parent_product) {
      const newWcProduct = await this.api.post("products", {
        name: appProduct.name,
        type: "simple",
        sku: appProduct.sku
      }) as WooCommerceResponse;

      if (newWcProduct.data.id) {
        await prdct.createSalesChannelProduct(newWcProduct.data.id, appProduct, this.salesChannel.id);
      }
    } else {
      const parentProduct = appProduct.parent_product ? 
        await prdct.getProductById(appProduct.parent_product) : 
        appProduct;

      if (!parentProduct) {
        throw new Error('Parent product not found');
      }

      const childAttributes = await prdct.getAllChildProductAttributes(parentProduct.product_id);
      const processedAttributes = [];

      for (const attr of childAttributes) {
        const wcAttribute = await this.syncAttribute(attr.attributeId); // Fixed method name
        if (wcAttribute?.id) {
          processedAttributes.push({
            id: wcAttribute.id,
            visible: true,
            variation: true,
            options: attr.values
          });
        }
      }

      const newWcParentProduct = await this.api.post("products", {
        name: parentProduct.name,
        sku: parentProduct.sku,
        type: "variable",
        attributes: processedAttributes
      }) as WooCommerceResponse;

      if (!newWcParentProduct.data.id) {
        throw new Error('Failed to create parent product in WooCommerce');
      }

      const wcParentProductId = newWcParentProduct.data.id;
      await prdct.createSalesChannelProduct(wcParentProductId, parentProduct, this.salesChannel.id);

      if (parentProduct.child_products) {
        for (const childId of parentProduct.child_products) {
          const childProduct = await prdct.getProductById(childId);
          
          if (!childProduct?.attribute_value) {
            console.log(`Child product ${childId} not found or has no attributes`);
            continue;
          }

          const attributeJsonArray = [];

          for (const attrValueId of childProduct.attribute_value) {
            const attributeValueProduct = await this.attributeValueProductService.readOne(attrValueId);

            if (!attributeValueProduct?.attribute_value_id) {
              console.log(`Attribute value product not found for ID ${attrValueId}`);
              continue;
            }

            const attributeValue = await this.attributeValueService.readOne(attributeValueProduct.attribute_value_id);
            
            if (!attributeValue?.attribute) {
              console.log(`Attribute value not found for ID ${attributeValueProduct.attribute_value_id}`);
              continue;
            }

            const wcAttribute = await this.syncAttribute(attributeValue.attribute); // Fixed method name
            if (wcAttribute?.id && attributeValue?.value) {
              attributeJsonArray.push({
                id: wcAttribute.id,
                option: attributeValue.value
              });
            }
          }

          if (attributeJsonArray.length > 0) {
            const wcChildProduct = await this.api.post(
              `products/${wcParentProductId}/variations`,
              { attributes: attributeJsonArray }
            ) as WooCommerceResponse;

            if (wcChildProduct.data.id) {
              await prdct.createSalesChannelProduct(wcChildProduct.data.id, childProduct, this.salesChannel.id);
            }
          }
        }
      }
    }
  }
}

export default WoocommerceSync;
