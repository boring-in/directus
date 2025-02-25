import Product from "./Product";
import Address from "./Address";

/**
 * Interface for shipping address data
 */
interface ShippingAddress {
  country: string;
  city: string;
  address: string;
  postcode: string;
}

/**
 * Interface for sales channel information
 */
interface SalesChannelInfo {
  id: string | number;
}

/**
 * Interface for sales channel product data
 */
interface SalesChannelProduct {
  id: string | number;
  sales_channel: string | number;
  sales_channel_product_name: string;
  sales_channel_product_id: string;
  product: string | number;
  product_status: number;
}

/**
 * Interface for order product data extending base product data
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
  orderedProductData?: SalesChannelProduct;
}

/**
 * Interface for the ItemsService
 */
interface ItemsService {
  schema: any;
  createOne(data: any): Promise<any>;
  readByQuery(query: any): Promise<any[]>;
  readOne(id: string | number): Promise<any>;
  updateOne(id: string | number, data: any): Promise<any>;
}

/**
 * Class representing an Order entity
 * Handles order creation, updates, and retrieval operations
 */
class Order {
  private salesChannelOrderId: string;
  private salesChannelInfo: SalesChannelInfo;
  private orderDate: string;
  private products: OrderProduct[];
  private orderStatus: string;
  private customer: string | number;
  private shippingAddress: ShippingAddress;
  private shippingType: string;
  private shippingPrice: number;
  private productsTotalTaxIcl: number;
  private totalDiscountTaxIncl: number;
  private total: number;
  private status: string;
  private paymentType: string;
  private ItemsService: new (collection: string, options: { schema: any }) => ItemsService;
  private schema: any;

  /**
   * Creates an instance of Order
   */
  constructor(
    salesChannelOrderId: string,
    salesChannelInfo: SalesChannelInfo,
    orderDate: string,
    products: OrderProduct[],
    orderStatus: string,
    customer: string | number,
    shippingType: string,
    shippingPrice: number,
    productsTotalTaxIcl: number,
    totalDiscountTaxIncl: number,
    total: number,
    status: string,
    paymentType: string,
    shippingAddress: ShippingAddress,
    ItemsService: new (collection: string, options: { schema: any }) => ItemsService,
    schema: any
  ) {
    this.salesChannelOrderId = salesChannelOrderId;
    this.salesChannelInfo = salesChannelInfo;
    this.orderDate = orderDate;
    this.products = products;
    this.orderStatus = orderStatus;
    this.customer = customer;
    this.shippingAddress = shippingAddress;
    this.shippingType = shippingType;
    this.shippingPrice = shippingPrice;
    this.productsTotalTaxIcl = productsTotalTaxIcl;
    this.totalDiscountTaxIncl = totalDiscountTaxIncl;
    this.total = total;
    this.status = status;
    this.paymentType = paymentType;
    this.ItemsService = ItemsService;
    this.schema = schema;
  }

  /**
   * Creates a new order in the system
   */
  async createOrder(): Promise<void> {
    const orderService = new this.ItemsService("orders", { schema: this.schema });
    const status = this.orderStatus; // Initialize status with orderStatus
    const adr = new Address(
      this.shippingAddress.country,
      this.shippingAddress.city,
      this.shippingAddress.address,
      this.shippingAddress.postcode,
      this.ItemsService,
      this.schema
    );
    const address = await adr.getAddress();
    const newOrder = await orderService.createOne({
      sales_channel: this.salesChannelInfo.id,
      sales_channel_order_id: this.salesChannelOrderId,
      date_time: this.orderDate,
      order_status: status,
      customer: this.customer,
      payment_type: this.paymentType,
      address: address,
    });
    await this.createOrderProducts(newOrder);
  }

  /**
   * Creates order products associated with an order
   * @param orderId - ID of the order to associate products with
   */
  private async createOrderProducts(orderId: string | number): Promise<void> {
    const orderProductsService = new this.ItemsService("order_products", {
      schema: this.schema,
    });
    const prdct = new Product(this.ItemsService, this.schema);
    
    // Type assertion to handle the conversion between OrderProduct and ProductJson
    const productsForOrder = this.products.map(p => ({
      externalId: p.externalId,
      parentId: p.parentId,
      name: p.name,
      sku: p.sku,
      attributes: p.attributes
    }));
    
    const salesChannelProducts = await prdct.getProductsForOrder(
      this.salesChannelInfo.id,
      productsForOrder
    );

    for (let i = 0; i < this.products.length; i++) {
      const orderedProduct = this.products[i];
      const salesChannelProduct = salesChannelProducts[i];
      
      // Skip if either product is undefined or missing required data
      if (!orderedProduct || !salesChannelProduct?.orderedProductData) continue;
      
      await orderProductsService.createOne({
        product: salesChannelProduct.orderedProductData.product,
        quantity: orderedProduct.quantity,
        order: orderId,
        tax_rate: orderedProduct.taxRate,
        unit_price_tax_incl: orderedProduct.unitPrice,
      });
    }
  }

  /**
   * Updates an existing order's status
   * @param orderId - ID of the order in the sales channel
   * @param statusId - New status ID to set
   * @param salesChannelId - ID of the sales channel
   * @param ItemsService - Service for handling item operations
   * @param schema - Schema name for the database
   */
  static async updateOrder(
    orderId: string,
    statusId: string | number,
    salesChannelId: string | number,
    ItemsService: new (collection: string, options: { schema: any }) => ItemsService,
    schema: any
  ): Promise<void> {
    const staticOrderService = new ItemsService("orders", { schema: schema });
    const order = await staticOrderService.readByQuery({
      filter: {
        _and: [
          { sales_channel: salesChannelId },
          { sales_channel_order_id: orderId }
        ]
      }
    });
    console.log("order update");
    console.log(statusId);
    await staticOrderService.updateOne(order[0].id, { order_status: statusId });
  }

  /**
   * Retrieves an order by ID
   * @param orderId - ID of the order to retrieve
   * @param ItemsService - Service for handling item operations
   * @param schema - Schema name for the database
   * @returns Promise resolving to the order data
   */
  static async getOrder(
    orderId: string | number,
    ItemsService: new (collection: string, options: { schema: any }) => ItemsService,
    schema: any
  ): Promise<any> {
    const orderService = new ItemsService("orders", { schema: schema });
    const order = await orderService.readOne(orderId);
    return order;
  }
}

export default Order;
