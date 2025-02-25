import type { Knex } from "knex";
import  DataProvider from "../model/DataProvider";
import  DataWriter from "../model/DataWriter";
import { filter } from "async";



interface ItemsServiceOptions {
  schema: Schema;
}

interface ItemsService {
  readOne(id: number, options?: { fields: string[] }): Promise<any>;
  readByQuery(query: { filter: Record<string, any> }): Promise<any>;
  updateOne(id: number, data: Record<string, any>): Promise<any>;
  createOne(data: Record<string, any>): Promise<any>;
}

interface Services {
  ItemsService: new (collection: string, options: ItemsServiceOptions) => ItemsService;
}

interface Schema {
  collections: Record<string, any>;
}

interface OrderProduct {
  id: number;
  order: number;
  product: number;
  warehouse: number;
  quantity: number;
  unit_price_tax_incl: number;
  stock?: number;
  reserved_quantity?: number;
}

interface Product {
  product_id: number;
  product_type: number;
  name: string;
}

interface OrderProductWithProduct {
  warehouse: number;
  product: Product;
  quantity: number;
}

interface Order {
  id: number;
  type: number;
  total: number;
  shipping_price: number;
  total_discount_tax_incl: number;
  products_total_tax_incl: number;
  order_status: number;
  products: OrderProductWithProduct[];
}

interface HookContext {
  services: Services;
  database: Knex;
  getSchema: () => Promise<Schema>;
}

interface FilterInput {
  [x: string]: any;
  product: number;
  warehouse: number;
  quantity: number;
  sold_out?: boolean;
  purchase_delay?: number;
  product_calculation_type?: number;
  stock_available?: number;
  attributes?: JSON;
}

interface ActionPayload<T = any> {
  payload: T;
  key: number;
}

interface ActionPayloadWithKeys<T = any> {
  payload: T;
  keys: number[];
}

interface OrderStatusHistory {
  date_created: Date;
  order_id: number;
  status_id: number;
}

interface Stock {
  id: number;
  reserved_quantity: number;
}

/**
 * Sets up hooks for order-related operations
 * @param context - The hook context containing services, database, and schema
 * @returns Object containing hook handlers
 */
export const setupOrderHooks = ({ services, database, getSchema }: HookContext) => {
  const { ItemsService } = services;
  const missingProductsStatus = 37;
  const paymentAcceptedStatus = 48;
  const processingStatus = 2;

  return {
    'order_products.items.create': {
      filter: async (input: FilterInput): Promise<FilterInput> => {
        
          const schema = await getSchema();
          const orderProductService = new ItemsService("order_products", { schema });
          const productService = new ItemsService("product", { schema });
         if(input.product){
            let product = await productService.readOne(input.product);
            input.product_name = product.name;
            input.attributes = product.attributes;
         }
        if(input.warehouse != undefined){
          const schema = await getSchema();
          const dataWriter = new DataWriter(database);
          const dataProvider = new DataProvider(database);

          const lastTimestamp = await dataProvider.getLastTimestamp(input.product, input.warehouse);
          const productCalculationType = await dataProvider.getProductCalculationType(input.product, input.warehouse);

          if (productCalculationType === 1 || productCalculationType === 2) {
            const soldOut = await dataProvider.isSoldOut(input.product, input.warehouse);
            input.sold_out = soldOut;
          }


          await dataWriter.createProductTimestamp(input.product, input.warehouse, new Date());
          await dataWriter.productLastPurchasedTimestamp(input.product, input.warehouse);

          if (lastTimestamp != null) {
            const lastTimestampDate = new Date(lastTimestamp.last_timestamp);
            const currentTimestampDate = new Date();
            const timeDifferenceMillis = currentTimestampDate.getTime() - lastTimestampDate.getTime();
            const timeDifferenceSeconds = timeDifferenceMillis / 1000;
            input.purchase_delay = timeDifferenceSeconds;
          } else {
            input.purchase_delay = 0;
          }
          input.attributes = await dataProvider.getProductAttributesJson(input.product);
          input.product_calculation_type = await dataProvider.getWarehouseProductCalculationType(input.product, input.warehouse);
          input.stock_available = await dataProvider.getOrderProductSufficiency(input.product, input.warehouse, input.quantity);
          return input;
        }
        return input;
      },
      action: async ({ payload, key }: ActionPayload): Promise<void> => {
        try {
          const schema = await getSchema();
          const orderProductService = new ItemsService("order_products", { schema });
          await orderProductService.updateOne(key, { stock: key });
        } catch (err) {
          console.error(err);
        }
      }
    },

    'order_products.items.delete': {
      filter: async (keys: number[]): Promise<number[]> => {
        if (!Array.isArray(keys) || keys.length === 0) {
          return keys;
        }

        const deletedItemId = keys[0];

        try {
          const schema = await getSchema();
          const orderService = new ItemsService("orders", { schema });
          const orderProductService = new ItemsService("order_products", { schema });
          //@ts-ignore
          const orderProduct = await orderProductService.readOne(deletedItemId) as OrderProduct;

          if (orderProduct?.order != null) {
            const order = await orderService.readOne(orderProduct.order) as Order;

            if (order) {
              switch (order.type) {
                case 0: {
                  const total = order.total - orderProduct.unit_price_tax_incl * orderProduct.quantity;
                  await orderService.updateOne(order.id, { 
                    products_total_tax_incl: total, 
                    total: total + order.shipping_price - order.total_discount_tax_incl 
                  });
                  break;
                }
                case 1:
                case 2: {
                  const totalDiscount = order.total_discount_tax_incl - orderProduct.unit_price_tax_incl * orderProduct.quantity;
                  const productsTotalTaxIncl = order.products_total_tax_incl - orderProduct.unit_price_tax_incl * orderProduct.quantity;
                  await orderService.updateOne(order.id, { 
                    total_discount_tax_incl: totalDiscount, 
                    products_total_tax_incl: productsTotalTaxIncl 
                  });
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.error("Error in order_products delete filter:", error);
        }

        return keys;
      }
    },

    'order_products.items.update': {
      filter: async (input: Record<string, any>, payload: any): Promise<Record<string, any>> => {
        const schema = await getSchema();
        const orderProductService = new ItemsService("order_products", { schema });
        const productService = new ItemsService("products", { schema });
       if(input.product){
          let product = await productService.readOne(input.product);
          input.product_name = product.name;
          input.attributes = product.attributes;
       }

       
        return input;
      },
      action: async ({ payload, keys }: ActionPayloadWithKeys): Promise<void> => {
        const schema = await getSchema();
        const orderService = new ItemsService("orders", { schema });
        const orderProductService = new ItemsService("order_products", { schema });

        for (const key of keys) {
          const orderProduct = await orderProductService.readOne(key) as OrderProduct;
          if (!orderProduct) continue;

          const order = await orderService.readOne(orderProduct.order) as Order;
          if (!order) continue;

          let total = 0;
          let orderProducts: OrderProduct[];

          switch (order.type) {
            case 0: {
              orderProducts = await orderProductService.readByQuery({ 
                filter: { order: { _eq: order.id } } 
              });
              total = orderProducts.reduce((sum, op) => 
                sum + (op.unit_price_tax_incl ?? 0) * (op.quantity ?? 0), 0);
              await orderService.updateOne(order.id, { 
                subtotal: total + order.shipping_price, 
                products_total_tax_incl: total 
              });
              break;
            }
            case 1:
            case 2: {
              orderProducts = await orderProductService.readByQuery({ 
                filter: { order: { _eq: order.id } } 
              });
              total = orderProducts.reduce((sum, op) => 
                sum + (op.unit_price_tax_incl ?? 0) * (op.quantity ?? 0), 0);
              const totalDiscount = total + order.shipping_price;
              await orderService.updateOne(order.id, { 
                total_discount_tax_incl: totalDiscount, 
                products_total_tax_incl: total 
              });
              break;
            }
          }
        }
      }
    },

    'orders.items.create': {
      filter: async (input: Record<string, any>,payload:any): Promise<Record<string, any>> => {
        console.log("CREATING ORDER\n\n\n")
        console.log(input)
        const schema = await getSchema();
        let customerService = new ItemsService("customers", { schema });
        // if(input.customer){
        //   let customer = await customerService.readOne(input.customer);
        //   input.address = customer.address;
        // }
        if(input.sales_channel){
          console.log(input.sales_channel)
          let salesChannelService = new ItemsService("sales_channel", { schema });
          let salesChannel = await salesChannelService.readOne(input.sales_channel);
          let currencyId = salesChannel.default_currency;
          if(currencyId){
            let currencyService = new ItemsService("currency", { schema });
            let currency = await currencyService.readOne(currencyId);
            input.currency = currency.id;
            console.log(currency.symbol)
            console.log(currency.symbol)
            input.currency_symbol = currency.symbol;
          }
        }
        return input;
      },
      action: async ({ key }: ActionPayload): Promise<void> => {
        const schema = await getSchema();
        const ordersService = new ItemsService("orders", { schema });
        const stockService = new ItemsService("stock", { schema });
        const orderStatusHistoryService = new ItemsService("order_status_history", { schema });

        const order = await ordersService.readOne(key, {
          fields: [
            "order_status",
            "products.warehouse",
            "products.product.product_id",
            "products.product.product_type",
            "products.quantity",
            "products.product.name",
            "sales_channel.name",
            "id",
          ],
        }) as Order;

        if (!order) return;

        const status = order.order_status;
        const products = order.products;

        for (const product of products) {
          if (product.product.product_type === 0) {
            const stockResult = await stockService.readByQuery({
              filter: {
                _and: [
                  { warehouse: { _eq: product.warehouse } },
                  { product: { _eq: product.product.product_id } },
                ],
              },
            }) as Stock[];

            if (stockResult?.[0]) {
              const stockReservedQuantity = stockResult[0].reserved_quantity ?? 0;
              const orderOrderedQuantity = product.quantity;
              const finalStockReservedQuantity = stockReservedQuantity + orderOrderedQuantity;

              await stockService.updateOne(stockResult[0].id, {
                reserved_quantity: finalStockReservedQuantity,
              });
            }
          }
        }

        const orderHistoryEntry: OrderStatusHistory = {
          date_created: new Date(),
          order_id: order.id,
          status_id: status,
        };

        await orderStatusHistoryService.createOne(orderHistoryEntry);
      }
    },

    'orders.items.update': {
      filter: async (input: Record<string, any>,payload:any): Promise<Record<string, any>> => {
        const schema = await getSchema();
        console.log(input)
        console.log(payload)
        const orderService = new ItemsService("orders", { schema });
        let order = await orderService.readOne(payload.keys[0]);
        if (input.carrier) {
         
          const carrierService = new ItemsService("carriers", { schema });
          const taxService = new ItemsService("taxes", { schema });
      
          const carrier = await carrierService.readOne(input.carrier);
          if (carrier?.tax) {
            let tax = await taxService.readOne(carrier.tax);
            input.shipping_tax = tax.percent;
          }
          if (carrier?.price) {
            input.shipping_price = carrier.price;
            input.total = order.subtotal + carrier.price;
            input.subtotal = input.total
          }
          if(carrier?.name){
            input.shipping_type = carrier.name;
          }
        }
        if(input.discount){
          console.log("discount")
          let oldDiscount = order.total_discount_tax_incl == null ? 0 : order.total_discount_tax_incl;
          input.total_discount_tax_incl = input.discount;
          input.total = order.subtotal + oldDiscount - input.discount;
          console.log(input.total)
        }
        if(input.discount_percent){
          console.log("discount percent")
          let oldDiscount = order.total_discount_tax_incl == null ? 0 : order.total_discount_tax_incl;
          input.total_discount_tax_incl = order.subtotal * input.discount_percent / 100;
          input.total = order.subtotal - input.total_discount_tax_incl + oldDiscount;
          console.log(input.total)
        }

        return input;
      },
      action: async ({ payload, key }: ActionPayload): Promise<void> => {
        if (!key) return;
        const schema = await getSchema();
        const ordersService = new ItemsService("orders", { schema });
        const order = await ordersService.readOne(key);
        if (!order) return;
        // Will be filled with calculation logic later
      }
    }

  };
};
