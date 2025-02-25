import Product from "../model/Product";
import Address from "../model/Address";
class Order {
  salesChannelOrderId;
  salesChannelId;
  products; //array
  orderStatus;
  customer;
  paymentType;
  shippingType;
  productsTotalTaxIcl;
  totalDiscountTaxIncl;
  total;

  constructor(
    salesChannelOrderId,
    salesChannelInfo,
    orderDate,
    products,
    orderStatus,
    customer,
    shippingType,
    shippingPrice,
    productsTotalTaxIcl,
    totalDiscountTaxIncl,
    total,
    status,
    paymentType,
    shippingAddress,
    ItemsService,
    schema
  ) {
    this.salesChannelOrderId = salesChannelOrderId;
    this.salesChannelInfo = salesChannelInfo;
    (this.orderDate = orderDate), (this.products = products);
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

  async createOrder() {
    let orderService = new this.ItemsService("orders", { schema: this.schema });
    let status; //todo
    let adr = new Address(
      this.shippingAddress.country,
      this.shippingAddress.city,
      this.shippingAddress.address,
      this.shippingAddress.postcode,
      this.ItemsService,
      this.schema
    );
    let address = await adr.getAddress();
    let newOrder = await orderService.createOne({
      sales_channel: this.salesChannelInfo.id,
      sales_channel_order_id: this.salesChannelOrderId,
      date_time: this.orderDate,
      order_status: status,
      customer: this.customer,
      payment_type: this.paymentType,
      address: address,
    });
    let orderProducts = await this.createOrderProducts(newOrder);
  }

  async createOrderProducts(orderId) {
    let orderProductsService = new this.ItemsService("order_products", {
      schema: this.schema,
    });
    let prdct = new Product(this.ItemsService, this.schema);
    let salesChannelProducts = await prdct.getProductsForOrder(
      this.salesChannelInfo.id,
      this.products
    );

    for (let i = 0; i < this.products.length; i++) {
      let orderedProduct = salesChannelProducts[i];
      await orderProductsService.createOne({
        product: orderedProduct.orderedProductData.product,
        quantity: orderedProduct.quantity,
        order: orderId,
        tax_rate: orderedProduct.taxRate,
        unit_price_tax_incl: orderedProduct.unitPrice,
      });
    }
  }

  static async updateOrder(orderId,statusId,salesChannelId,ItemsService , schema) {
      let staticOrderService = new ItemsService("orders",{schema:schema});
      let order = await staticOrderService.readByQuery({filter:{_and:[{sales_channel:salesChannelId},{sales_channel_order_id:orderId}]}});
      console.log("order update");
      console.log(statusId);
      await staticOrderService.updateOne(order[0].id,{order_status:statusId});

  }
  static async getOrder(orderId, ItemsService, schema){
    let orderService = new ItemsService("orders",{schema:schema});
    let order = await orderService.readOne(orderId);
    return order;
  }
}
export default Order;
