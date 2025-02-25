import DataProvider from "../model/DataProvider";
import DataWriter from "../model/DataWriter";

export const setupOrderHooks = ({ services, database, getSchema }) => {
  const { ItemsService } = services;
  const missingProductsStatus = 37;
  const paymentAcceptedStatus = 48;
  const processingStatus = 2;

  return {
    'order_products.items.create': {
      filter: async (input) => {
        let schema = await getSchema();
        let dataWriter = new DataWriter(database);
        let dataProvider = new DataProvider(database);

        let lastTimestamp = await dataProvider.getLastTimestamp(input.product, input.warehouse);
        let productCalculationType = await dataProvider.getProductCalculationType(input.product, input.warehouse);

        if (productCalculationType == 1 || productCalculationType == 2) {
          let soldOut = await dataProvider.isSoldOut(input.product, input.warehouse);
          input.sold_out = soldOut;
        }

        await dataWriter.createProductTimestamp(input.product, input.warehouse, new Date());
        await dataWriter.productLastPurchasedTimestamp(input.product, input.warehouse);

        if (lastTimestamp != null) {
          let lastTimestampDate = new Date(lastTimestamp.last_timestamp);
          let currentTimestampDate = new Date();
          let timeDifferenceMillis = currentTimestampDate - lastTimestampDate;
          let timeDifferenceSeconds = timeDifferenceMillis / 1000;
          input.purchase_delay = timeDifferenceSeconds;
        } else {
          input.purchase_delay = 0;
        }
        input.product_calculation_type = await dataProvider.getWarehouseProductCalculationType(input.product, input.warehouse);
        input.stock_available = await dataProvider.getOrderProductSufficiency(input.product, input.warehouse, input.quantity);
        return input;
      },
      action: async ({ payload, key }) => {
        try {
          const schema = await getSchema();
          let orderProductService = new ItemsService("order_products", { schema });
          await orderProductService.updateOne(key, { stock: key });
        } catch (err) {
          console.error(err);
        }
      }
    },

    'order_products.items.delete': {
      filter: async (keys) => {
        if (!Array.isArray(keys) || keys.length === 0) {
          return keys;
        }

        const deletedItemId = keys[0];

        try {
          const schema = await getSchema();
          const orderService = new ItemsService("orders", { schema });
          const orderProductService = new ItemsService("order_products", { schema });

          const orderProduct = await orderProductService.readOne(deletedItemId);

          if (orderProduct && orderProduct.order != null) {
            const order = await orderService.readOne(orderProduct.order);

            if (order) {
              switch (order.type) {
                case 0:
                  const total = order.total - orderProduct.unit_price_tax_incl * orderProduct.quantity;
                  await orderService.updateOne(order.id, { products_total_tax_incl: total, total: total + order.shipping_price - order.total_discount_tax_incl });
                  break;
                case 1:
                case 2:
                  const totalDiscount = order.total_discount_tax_incl - orderProduct.unit_price_tax_incl * orderProduct.quantity;
                  const productsTotalTaxIncl = order.products_total_tax_incl - orderProduct.unit_price_tax_incl * orderProduct.quantity;
                  await orderService.updateOne(order.id, { total_discount_tax_incl: totalDiscount, products_total_tax_incl: productsTotalTaxIncl });
                  break;
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
      action: async ({ payload, keys }) => {
        let schema = await getSchema();
        let orderService = new ItemsService("orders", { schema });
        let orderProductService = new ItemsService("order_products", { schema });

        for (let i = 0; i < keys.length; i++) {
          let orderProduct = await orderProductService.readOne(keys[i]);
          let order = await orderService.readOne(orderProduct.order);
          let total = 0;
          let orderProducts;

          switch (order.type) {
            case 0:
              orderProducts = await orderProductService.readByQuery({ filter: { order: { _eq: order.id } } });
              for (let i = 0; i < orderProducts.length; i++) {
                total += orderProducts[i].unit_price_tax_incl * orderProducts[i].quantity;
              }
              await orderService.updateOne(order.id, { total: total + order.shipping_price, products_total_tax_incl: total });
              break;

            case 1:
            case 2:
              orderProducts = await orderProductService.readByQuery({ filter: { order: { _eq: order.id } } });
              for (let i = 0; i < orderProducts.length; i++) {
                total += orderProducts[i].unit_price_tax_incl * orderProducts[i].quantity;
              }
              let totalDiscount = total + order.shipping_price;
              await orderService.updateOne(order.id, { total_discount_tax_incl: totalDiscount, products_total_tax_incl: total });
              break;
          }
        }
      }
    },

    'orders.items.create': {
      action: async ({ key }) => {
        let schema = await getSchema();
        let ordersService = new ItemsService("orders", { schema });
        let stockService = new ItemsService("stock", { schema });
        let orderStatusHistoryService = new ItemsService("order_status_history", { schema });

        let order = await ordersService.readOne(key, {
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
        });

        let status = order.order_status;
        let products = order.products;

        for (let i = 0; i < products.length; i++) {
          if (products[i].product.product_type == 0) {
            let stock = await stockService.readByQuery({
              filter: {
                _and: [
                  { warehouse: { _eq: products[i].warehouse } },
                  { product: { _eq: products[i].product.product_id } },
                ],
              },
            });

            let stockReservedQuantity = stock[0].reserved_quantity;
            let orderOrderedQuantity = products[i].quantity;
            let finalStockReservedQuantity = stockReservedQuantity + orderOrderedQuantity;

            await stockService.updateOne(stock[0].id, {
              reserved_quantity: finalStockReservedQuantity,
            });
          }
        }

        let date = new Date();
        await orderStatusHistoryService.createOne({
          date_created: date,
          order_id: order.id,
          status_id: status,
        });
      }
    }
  };
};
