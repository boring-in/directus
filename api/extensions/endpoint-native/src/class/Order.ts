import Product from "./Product";
import Address from "./Address";

interface SalesChannelInfo {
  id: string;
}

interface Customer {
  id: string;
}

interface ShippingAddress {
  country: string;
  city: string;
  address: string;
  postcode: string;
}

// interface ItemsService {
//   constructor(collection: string, options: any): void;
//   createOne(data: any): Promise<string>;
//   readByQuery(query: any): Promise<any[]>;
//   readOne(id: string): Promise<any>;
//   updateOne(id: string, data: any): Promise<void>;
// }

class Order {
  salesChannelOrderId: string;
  salesChannelId?: string;
  products: any[]; // Consider creating a more specific type
  orderStatus: string;
  customer: Customer;
  paymentType: string;
  shippingType: string;
  productsTotalTaxIcl: number;
  totalDiscountTaxIncl: number;
  total: number;
  salesChannelInfo: SalesChannelInfo;
  orderDate: string;
  shippingTax: number;
  shippingAddress: ShippingAddress;
  shippingPrice: number;
  ItemsService:  any;
  schema: any;

  constructor(
    salesChannelOrderId: string,
    salesChannelInfo: SalesChannelInfo,
    orderDate: string,
    products: any[],
    orderStatus: string,
    customer: Customer,
    shippingType: string,
    shippingTax: number,
    shippingPrice: number,
    productsTotalTaxIcl: number,
    totalDiscountTaxIncl: number,
    total: number,
    paymentType: string,
    shippingAddress: ShippingAddress,
    ItemsService:  any,
    schema: any
  ) {
    this.salesChannelOrderId = salesChannelOrderId;
    this.salesChannelInfo = salesChannelInfo;
    this.orderDate = orderDate;
    this.products = products;
    this.orderStatus = orderStatus;
    this.customer = customer;
    this.shippingTax = shippingTax;
    this.shippingAddress = shippingAddress;
    this.shippingType = shippingType;
    this.shippingPrice = shippingPrice;
    this.productsTotalTaxIcl = productsTotalTaxIcl;
    this.totalDiscountTaxIncl = totalDiscountTaxIncl;
    this.total = total;
    this.paymentType = paymentType;
    this.ItemsService = ItemsService;
    this.schema = schema;
  }

  async createOrder(){
    let orderService = new this.ItemsService("orders", { schema: this.schema });
    let adr = new Address(
      this.shippingAddress.country,
      this.shippingAddress.city,
      this.shippingAddress.address,
      this.shippingAddress.postcode,
      null,
      null,
      this.ItemsService,
      this.schema
    );
    let address = await adr.getAddress(Number(this.customer.id));

    let newOrder = await orderService.createOne({
      sales_channel: this.salesChannelInfo.id,
      sales_channel_order_id: this.salesChannelOrderId,
      date_time: this.orderDate,
      order_status: this.orderStatus,
      customer: this.customer.id,
      payment_type: this.paymentType,
      shipping_price: this.shippingPrice,
      shipping_tax: this.shippingTax,
      address: address,
      total: this.total,
      products_total_tax_incl: this.productsTotalTaxIcl,
      total_discount_tax_incl: this.totalDiscountTaxIncl,
      shipping_type: this.shippingType
    });
    let orderProducts = await this.createOrderProducts(newOrder);
  }

  async createOrderProducts(orderId: string): Promise<void> {
    let orderProductsService = new this.ItemsService("order_products", {
      schema: this.schema,
    });
    let prdct = new Product(this.ItemsService, this.schema);
    // console.log("products for order");
    // console.log(this.products);
    let salesChannelProducts = await prdct.getProductsForOrder(
      this.salesChannelInfo.id,
      this.products
    );

    for (let i = 0; i < this.products.length; i++) {
      let salesChannelService = new this.ItemsService("sales_channel", {schema :this.schema});
      let salesChannel = await salesChannelService.readOne(this.salesChannelInfo.id);
      let orderedProduct = salesChannelProducts[i];
      if(orderedProduct.app_warehouse === undefined){
        orderedProduct.app_warehouse = salesChannel.default_warehouse;
      }
      if (orderedProduct.attributes === '') {
        orderedProduct.attributes = [];
      }
      await orderProductsService.createOne({
        product: orderedProduct.orderedProductData.product,
        quantity: orderedProduct.quantity,
        order: orderId,
        tax_rate: orderedProduct.tax_rate,
        unit_price_tax_incl: orderedProduct.total / orderedProduct.quantity,
        full_price: orderedProduct.total,
        product_name: orderedProduct.name,
        attributes: orderedProduct.attributes,
        warehouse: orderedProduct.app_warehouse,
        stock: orderedProduct?.app_warehouse
      });
    }
  }

  static async updateOrder(
    orderId: string, 
    statusId: string, 
    salesChannelId: string, 
    ItemsService: any, 
    schema: any
  ): Promise<void> {
    let staticOrderService = new ItemsService("orders", { schema: schema });
    let order = await staticOrderService.readByQuery({
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

  static async getOrder(
    orderId: string, 
    ItemsService: any, 
    schema: any
  ): Promise<any> {
    let orderService = new ItemsService("orders", { schema: schema });
    let order = await orderService.readOne(orderId);
    return order;
  }
}

export default Order;