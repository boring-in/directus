import DataProvider from "../model/DataProvider";
import BarcodeUtil from "../model/BarcodeUtil";

export const setupStockHooks = ({ services, database, getSchema }) => {
  const { ItemsService } = services;

  async function updateStock(warehouse, quantityDifference, productId, stockService) {
    let stock = await stockService.readByQuery({
      filter: {
        _and: [
          { warehouse: warehouse },
          { product: productId }
        ]
      }
    });
    if (stock.length == 0) {
      await stockService.createOne({ product: productId, warehouse: warehouse, onhand_quantity: quantityDifference });
    } else {
      let currentQuantity = stock[0].onhand_quantity;
      let newOnhandQuantity = Number(currentQuantity) + Number(quantityDifference);
      await stockService.updateOne(stock[0].id, { onhand_quantity: newOnhandQuantity });
    }
  }

  async function updateStockWriteoff(quantity, warehouse, product, stockService, overwrite) {
    let onhandStock = await stockService.readByQuery({
      filter: {
        _and: [
          { warehouse: warehouse },
          { product: product }
        ]
      }
    });
    if (onhandStock.length == 0) {
      await stockService.createOne({ warehouse: warehouse, product: product, onhand_quantity: quantity });
      return quantity;
    } else {
      let newOnhandQuantity;
      if (overwrite == false) {
        let currentQuantity = onhandStock[0].onhand_quantity;
        if (currentQuantity < quantity) {
          quantity = currentQuantity;
        }
        newOnhandQuantity = currentQuantity - quantity;
      } else {
        newOnhandQuantity = quantity;
      }
      await stockService.updateOne(onhandStock[0].id, { onhand_quantity: newOnhandQuantity });
      return newOnhandQuantity;
    }
  }

  return {
    'stock.items.create': {
      action: async (payload) => {
        try {
          let schema = await getSchema();
          let stockService = new ItemsService("stock", { schema });
          let warehouseProductService = new ItemsService("warehouse_products", { schema });
          let stockItem = await stockService.readOne(payload.key);
          let availabeQuantity = stockItem.onhand_quantity - stockItem.reserved_quantity - stockItem.ordered_quantity - stockItem.preparing_quantity;
          await stockService.updateOne(payload.key, { available_quantity: availabeQuantity });
          let warehouseProduct = await warehouseProductService.readByQuery({ filter: { _and: [{ product: { _eq: stockItem.product } }, { warehouse: { _eq: stockItem.warehouse } }] } });
          if (warehouseProduct.length == 0) {
            await warehouseProductService.createOne({ warehouse: stockItem.warehouse, product: stockItem.product });
          }
        } catch (err) {
          console.error(err);
        }
      }
    },

    'stock.items.update': {
      action: async (payload) => {
        try {
          for (let i = 0; i < payload.keys.length; i++) {
            await database.raw(`UPDATE stock s SET s.available_quantity = s.onhand_quantity - s.reserved_quantity - s.ordered_quantity - s.preparing_quantity WHERE id = ${payload.keys[i]}`);
          }
        } catch (err) {
          console.error(err);
        }
      }
    },

    'stock_replenishment.items.create': {
      action: async ({ payload, key }) => {
        try {
          const schema = await getSchema();
          let stockService = new ItemsService("stock", { schema });
          let warehouseReceivingService = new ItemsService("stock_replenishment", { schema });
          let stockReplenishmentValueService = new ItemsService('stock_value', { schema });
          let stockReplenishmentService = new ItemsService('stock_replenishment', { schema });
          let warehouseReceiving = await warehouseReceivingService.readOne(key, { fields: ["warehouse", "metadata"] });
          let metadata = warehouseReceiving.metadata || [];

          if (payload.barcode_scanner != null && payload.barcode_scanner.length != 0) {
            let productReceivedService = new ItemsService("stock_replenishment_products", { schema });
            for (let i = 0; i < payload.barcode_scanner.length; i++) {
              let item = payload.barcode_scanner[i];
              let productReceivedId = await productReceivedService.createOne({
                product: item.product_id,
                stock_replenishment: key,
                quantity: item.quantity,
                unit_price: item.unit_price,
                full_price: (item.unit_price * item.quantity).toFixed(2)
              });
              let data = {
                product_received_id: productReceivedId,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                full_price: (item.unit_price * item.quantity)
              };
              metadata.push(data);
            }
          }
          await warehouseReceivingService.updateOne(key, { metadata: metadata, barcode_scanner: [] });
        } catch (err) {
          console.error(err);
        }
      }
    },

    'stock_replenishment.items.update': {
      filter: async (input, payload) => {
        let schema = await getSchema();
        if (input.barcode_scanner != undefined) {
          await BarcodeUtil.processBarcodeMine(ItemsService, payload.keys[0], input, schema, "replenishment");
        }

        if (input.status != undefined) {
          if (input.status == 1) {
            let dataProvider = new DataProvider(database);
            let replenishmentProducts = await dataProvider.getStockReplenishmentProductsStock(payload.keys[0]);
            let stockService = new ItemsService("stock", { schema: schema });
            for (let i = 0; i < replenishmentProducts.length; i++) {
              let item = replenishmentProducts[i];
              await stockService.updateOne(item.stock, { onhand_quantity: item.onhand });
            }
          }
        }
        return input;
      }
    },

    'stock_write_off.items.create': {
      filter: async (input) => {
        let schema = await getSchema();
        let stockService = new ItemsService("stock", { schema });
        let product = input.product;
        let warehouse = input.warehouse;
        let quantity = input.quantity;
        let currentStock = await stockService.readByQuery({ filter: { _and: [{ warehouse: { _eq: warehouse } }, { product: { _eq: product } }] } });
        if (currentStock.length > 0) {
          let newOnhand = currentStock[0].onhand_quantity - quantity;
          await stockService.updateOne(currentStock[0].id, { onhand_quantity: newOnhand });
        }
        return input;
      }
    },

    'stock_transfer.items.update': {
      filter: async (input, payload, accountability) => {
        if (input.barcode_scanner || input.stock_transfer_products || input.status) {
          const schema = await getSchema();
          let stockTransferProductService = new ItemsService("stock_transfer_products", { schema });
          let stockService = new ItemsService("stock", { schema });
          let stockTransferService = new ItemsService("stock_transfer", { schema });
          let currentItem = await stockTransferService.readOne(payload.keys[0], { fields: ["*.*"] });
          let sendingWarehouse = currentItem.warehouse;
          let receivingWarehouse = currentItem.warehouse_receiving;

          if (input.barcode_scanner) {
            let scans = input.barcode_scanner;
            for (let i = 0; i < scans.length; i++) {
              let receivingStock = await stockService.readByQuery({
                filter: {
                  _and: [
                    { warehouse: receivingWarehouse },
                    { product: scans[i].product_id }
                  ]
                }
              });
              let receivingOnhand = 0;
              let receivingAvailable = 0;
              let receivingOrdered = 0;
              let receivingReserved = 0;
              if (receivingStock.length > 0) {
                receivingOnhand = receivingStock[0].onhand_quantity;
                receivingAvailable = receivingStock[0].available_quantity;
                receivingOrdered = receivingStock[0].ordered_quantity;
                receivingReserved = receivingStock[0].reserved_quantity;
              }
              await stockTransferProductService.createOne({
                product: scans[i].product_id,
                transfer_quantity: scans[i].units,
                sending_warehouse_onhand: scans[i].onhand,
                sending_warehouse_available: scans[i].available,
                receiving_warehouse_onhand: receivingOnhand,
                receiving_warehouse_available: receivingAvailable,
                receiving_warehouse_ordered: receivingOrdered,
                receiving_warehouse_reserved: receivingReserved,
                stock_transfer: payload.keys[0]
              });
            }
            input.barcode_scanner = [];
          }

          if (input.stock_transfer_products && input.stock_transfer_products.create.length > 0) {
            let creates = input.stock_transfer_products.create;
            for (let i = 0; i < creates.length; i++) {
              let create = creates[i];
              let sendingStock = await stockService.readByQuery({
                filter: {
                  _and: [
                    { warehouse: sendingWarehouse },
                    { product: create.product }
                  ]
                }
              });
              if (sendingStock.length > 0) {
                let sendingOnhand = sendingStock[0].onhand_quanitity;
                let sendingAvailable = sendingStock[0].available_quantity;
                let receivingOnhand = 0;
                let receivingAvailable = 0;
                let receivingOrdered = 0;
                let receivingReserved = 0;
                let receivingStock = await stockService.readByQuery({
                  filter: {
                    _and: [
                      { warehouse: receivingWarehouse },
                      { product: create.product }
                    ]
                  }
                });
                if (receivingStock.length > 0) {
                  receivingOnhand = receivingStock[0].onhand_quantity;
                  receivingAvailable = receivingStock[0].available_quantity;
                  receivingReserved = receivingStock[0].reserved_quantity;
                  receivingOrdered = receivingStock[0].ordered_quantity;
                }

                input.stock_transfer_products.create[i] = {
                  product: create.product,
                  transfer_quantity: create.transfer_quantity,
                  sending_warehouse_onhand: sendingOnhand,
                  sending_warehouse_available: sendingAvailable,
                  receiving_warehouse_onhand: receivingOnhand,
                  receiving_warehouse_available: receivingAvailable,
                  receiving_warehouse_ordered: receivingOrdered,
                  receiving_warehouse_reserved: receivingReserved,
                  stock_transfer: create.stock_transfer
                };
              } else {
                throw new Error(`product ${create.product} is not present in sending warehouse stock`);
              }
            }
          }
        }
        input.last_updated_on = new Date();
        input.last_user = accountability.accountability.user;
        return input;
      }
    }
  };
};
