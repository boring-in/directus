import DataProvider from "../model/DataProvider";
import BarcodeUtil from "../model/BarcodeUtil";
import { Knex } from "knex";
import { filter } from "async";
import WoocommerceSync from "../model/WoocommerceSync";

interface Services {
  ItemsService: any; // Using any as we don't have access to Directus types
}

interface StockItem {
  id: string;
  onhand_quantity: number;
  reserved_quantity: number;
  ordered_quantity: number;
  preparing_quantity: number;
  available_quantity: number;
  warehouse: string;
  product: string;
}

interface WarehouseProduct {
  warehouse: string;
  product: string;
}

interface StockReplenishment {
  warehouse: string;
  metadata?: Array<{
    product_received_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    full_price: number;
  }>;
}

interface BarcodeItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

interface StockTransfer {
  warehouse: string;
  warehouse_receiving: string;
  status: number;
}

interface StockTransferProduct {
  product: string;
  transfer_quantity: number;
  sending_warehouse_onhand: number;
  sending_warehouse_available: number;
  receiving_warehouse_onhand: number;
  receiving_warehouse_available: number;
  receiving_warehouse_ordered: number;
  receiving_warehouse_reserved: number;
  stock_transfer: string;
}

/**
 * Updates stock quantities for a given warehouse and product
 */
async function updateStock(
  warehouse: string,
  quantityDifference: number,
  productId: string,
  stockService: any
): Promise<void> {
  const stock = await stockService.readByQuery({
    filter: {
      _and: [
        { warehouse: warehouse },
        { product: productId }
      ]
    }
  });
  if (stock.length === 0) {
    await stockService.createOne({ product: productId, warehouse: warehouse, onhand_quantity: quantityDifference });
  } else {
    const currentQuantity = stock[0].onhand_quantity;
    const newOnhandQuantity = Number(currentQuantity) + Number(quantityDifference);
    await stockService.updateOne(stock[0].id, { onhand_quantity: newOnhandQuantity });
  }
}

/**
 * Updates stock write-off quantities
 */
async function updateStockWriteoff(
  quantity: number,
  warehouse: string,
  product: string,
  stockService: any,
  overwrite: boolean
): Promise<number> {
  const onhandStock = await stockService.readByQuery({
    filter: {
      _and: [
        { warehouse: warehouse },
        { product: product }
      ]
    }
  });
  if (onhandStock.length === 0) {
    await stockService.createOne({ warehouse: warehouse, product: product, onhand_quantity: quantity });
    return quantity;
  } else {
    let newOnhandQuantity: number;
    if (overwrite === false) {
      const currentQuantity = onhandStock[0].onhand_quantity;
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

export const setupStockHooks = ({ 
  services, 
  database, 
  getSchema 
}: { 
  services: Services; 
  database: Knex; 
  getSchema: () => Promise<unknown>;
}): Record<string, { action?: Function; filter?: Function }> => {
  const { ItemsService } = services;

  return {
    'purchase.items.create': {
      filter: async (input: any,payload:any,meta: { accountability: { user: string } }) => {
        input.user = meta.accountability.user;
        return input;
      }
    },

    'purchase.items.update': {
      filter: async (input: any,payload: { keys: string[] },meta: { accountability: { user: string } }) => {
        input.user = meta.accountability.user;
        if (input.barcode_scanner !== undefined && payload.keys[0]) {
          let schema = await getSchema();
          await BarcodeUtil.processBarcodeMine(ItemsService, payload.keys[0], input, schema, "purchase");
        }
      },
     
    },

    'stock.items.create': {
      action: async ({ payload, keys }: { payload: any, keys: string[] }): Promise<void> => {
        try {
          const schema = await getSchema();
          const stockService = new ItemsService("stock", { schema });
          const warehouseProductService = new ItemsService("warehouse_products", { schema });
          const stockItem = await stockService.readOne(keys[0]) as StockItem;
          const availabeQuantity = stockItem.onhand_quantity - stockItem.reserved_quantity - 
            stockItem.ordered_quantity - stockItem.preparing_quantity;
          await stockService.updateOne(keys[0], { available_quantity: availabeQuantity });
          const warehouseProduct = await warehouseProductService.readByQuery({ 
            filter: { 
              _and: [
                { product: { _eq: stockItem.product } }, 
                { warehouse: { _eq: stockItem.warehouse } }
              ] 
            } 
          }) as WarehouseProduct[];
          if (warehouseProduct.length === 0) {
            await warehouseProductService.createOne({ 
              warehouse: stockItem.warehouse, 
              product: stockItem.product 
            });
          }
        } catch (err) {
          console.error(err);
        }
      }
    },

    'stock.items.update': {
      action: async ({ payload, keys }: { payload: any, keys: string[] }): Promise<void> => {
        try {
          for (const key of keys) {
            await database.raw(
              `UPDATE stock s SET s.available_quantity = s.onhand_quantity - s.reserved_quantity - 
               s.ordered_quantity - s.preparing_quantity WHERE id = ${key}`
            );
          }
        } catch (err) {
          console.error(err);
        }

        try {
          let schema = await getSchema();
          const stockService = new ItemsService("stock", { schema });
          const salesChannelProductService = new ItemsService("sales_channel_products", { schema });
          const stockItem = await stockService.readOne(keys[0]) as StockItem;
          const salesChannelService = new ItemsService("sales_channel", { schema });
          let salesChannelProducts = await salesChannelProductService.readByQuery({
            filter:{ _and: [
              { sync_stock: { _eq: true } }, 
              { product: { _eq: stockItem.product } }
            ]  },
            fields:["sales_channel.cart_engine","sales_channel.id","product"]
          });
          
          for (const salesChannelProduct of salesChannelProducts) {
            if(salesChannelProduct.sales_channel.cart_engine == "WC"){
              let salesChannel = await salesChannelService.readOne(salesChannelProduct.sales_channel.id);
              let wcSync = new WoocommerceSync(ItemsService,schema ,salesChannel);
              await wcSync.syncStockUpstream(stockItem.product);
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
    },

    'stock_replenishment.items.create': {
      filter: async (input:any,payload:any,meta: { accountability: { user: string } }): Promise<any> => {
        input.user = meta.accountability.user;
        return input;
      },
      action: async ({ payload, keys }: { 
        payload: { barcode_scanner?: BarcodeItem[] }; 
        keys: string[] 
      }): Promise<void> => {
        try {
          const schema = await getSchema();
          const stockService = new ItemsService("stock", { schema });
          const warehouseReceivingService = new ItemsService("stock_replenishment", { schema });
          const stockReplenishmentValueService = new ItemsService('stock_value', { schema });
          const stockReplenishmentService = new ItemsService('stock_replenishment', { schema });
          const warehouseReceiving = await warehouseReceivingService.readOne(keys[0], { 
            fields: ["warehouse", "metadata"] 
          }) as StockReplenishment;
          const metadata = warehouseReceiving.metadata || [];

          if (payload.barcode_scanner != null && payload.barcode_scanner.length !== 0) {
            const productReceivedService = new ItemsService("stock_replenishment_products", { schema });
            for (const item of payload.barcode_scanner) {
              const productReceivedId = await productReceivedService.createOne({
                product: item.product_id,
                stock_replenishment: keys[0],
                quantity: item.quantity,
                unit_price: item.unit_price,
                full_price: (item.unit_price * item.quantity).toFixed(2)
              });
              const data = {
                product_received_id: productReceivedId,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                full_price: (item.unit_price * item.quantity)
              };
              metadata.push(data);
            }
          }
          await warehouseReceivingService.updateOne(keys[0], { metadata: metadata, barcode_scanner: [] });
        } catch (err) {
          console.error(err);
        }
      }
    },

    'stock_replenishment.items.update': {
      filter: async (input: any, payload: { keys: string[] }, meta: { accountability: { user: string } }): Promise<any> => {
        input.user = meta.accountability.user;
        const schema = await getSchema();
        if (input.barcode_scanner !== undefined && payload.keys[0]) {
          await BarcodeUtil.processBarcodeMine(ItemsService, payload.keys[0], input, schema, "replenishment");
        }
        return input;
      },
      action: async ({ payload, keys }: { payload: { status?: number }, keys: string[] }): Promise<void> => {
        try {
          const schema = await getSchema();
          const replenishmentService = new ItemsService("stock_replenishment", { schema });
          const replenishment = await replenishmentService.readOne(keys[0]);
          
          if (replenishment && payload.status === 1) {
            const dataProvider = new DataProvider(database);
            const replenishmentProducts = await dataProvider.getStockReplenishmentProductsStock(Number(keys[0]));
            const stockService = new ItemsService("stock", { schema });
            
            for (const item of replenishmentProducts) {
              await stockService.updateOne(item.stock, { onhand_quantity: item.onhand });
            }
          }
        } catch (err) {
          console.error('Error updating stock in replenishment action:', err);
        }
      }
    },

    'stock_write_off.items.create': { //(input: any, payload: { keys: string[] },meta: { accountability: { user: string } })
      filter: async (input: {user:any ,product: string; warehouse: string; quantity: number },meta: { accountability: { user: string } }): Promise<any> => {
        input.user = meta.accountability.user;
        return input;
      },
      action: async ({ payload, keys }: { payload: { product: string; warehouse: string; quantity: number }, keys: string[] }): Promise<void> => {
        try {
          const schema = await getSchema();
          const stockService = new ItemsService("stock", { schema });
          const writeOffService = new ItemsService("stock_write_off", { schema });
          
          const writeOff = await writeOffService.readOne(keys[0]);
          if (!writeOff || writeOff.status != 1) return;
          
          const currentStock = await stockService.readByQuery({ 
            filter: { 
              _and: [
                { warehouse: { _eq: payload.warehouse } }, 
                { product: { _eq: payload.product } }
              ] 
            } 
          });
          
          if (currentStock.length > 0) {
            const newOnhand = currentStock[0].onhand_quantity - payload.quantity;
            await stockService.updateOne(currentStock[0].id, { onhand_quantity: newOnhand });
          }
        } catch (err) {
          console.error('Error updating stock in write-off action:', err);
        }
      }
    },

    'stock_write_off.items.update': {
      action: async ({ payload, keys }: { payload: { product: string; warehouse: string; quantity: number }, keys: string[] }): Promise<void> => {
        try {
          const schema = await getSchema();
          const stockService = new ItemsService("stock", { schema });
          const writeOffService = new ItemsService("stock_write_off", { schema });
          
          const writeOff = await writeOffService.readOne(keys[0]);
          if (!writeOff || writeOff.status != 1) return;
          
          const currentStock = await stockService.readByQuery({ 
            filter: { 
              _and: [
                { warehouse: { _eq: payload.warehouse } }, 
                { product: { _eq: payload.product } }
              ] 
            } 
          });
          
          if (currentStock.length > 0) {
            const newOnhand = currentStock[0].onhand_quantity - payload.quantity;
            await stockService.updateOne(currentStock[0].id, { onhand_quantity: newOnhand });
          }
        } catch (err) {
          console.error('Error updating stock in write-off action:', err);
        }
      }
    },

    'stock_taking.items.create': {
      filter: async (input: any, payload: { keys: string[] },meta: { accountability: { user: string } }): Promise<any> => {
        input.user = meta.accountability.user;
        return input;
      },
      action: async ({ payload, keys }: { payload: { products?: { create: any[], update: any[], delete: any[] }, status?: number }, keys: string[] }): Promise<void> => {
        try {
          const schema = await getSchema();
          const stockService = new ItemsService("stock", { schema });
          const stockTakingService = new ItemsService("stock_taking", { schema });
          const stockTakingProductService = new ItemsService("stock_taking_product", { schema });

          const stockTaking = await stockTakingService.readOne(keys[0]);
          if (!stockTaking || payload.status !== 1) return;

          const stockTakingProducts = await stockTakingProductService.readByQuery({
            filter: {
              stock_taking: { _eq: keys[0] }
            }
          });

          for (const product of stockTakingProducts) {
            const stock = await stockService.readByQuery({
              filter: {
                _and: [
                  { warehouse: { _eq: stockTaking.warehouse } },
                  { product: { _eq: product.product } }
                ]
              }
            });

            if (stock.length > 0) {
              await stockService.updateOne(stock[0].id, { onhand_quantity: product.quantity });
            } else {
              await stockService.createOne({
                warehouse: stockTaking.warehouse,
                product: product.product,
                onhand_quantity: product.quantity
              });
            }
          }
        } catch (err) {
          console.error('Error updating stock in stock taking action:', err);
        }
      }
    },

    'stock_taking.items.update': {
      filter: async (input: any, payload: { keys: string[] },meta: { accountability: { user: string } }): Promise<any> => {
        const schema = await getSchema();
        if (input.barcode_scanner !== undefined && payload.keys[0]) {
          await BarcodeUtil.processBarcodeMine(ItemsService, payload.keys[0], input, schema, "taking");
        }
        return input;
      },
      action: async ({ payload, keys }: { payload: { products?: { create: any[], update: any[], delete: any[] }, status?: number }, keys: string[] }): Promise<void> => {
        try {
          const schema = await getSchema();
          const stockService = new ItemsService("stock", { schema });
          const stockTakingService = new ItemsService("stock_taking", { schema });
          const stockTakingProductService = new ItemsService("stock_taking_product", { schema });

          const stockTaking = await stockTakingService.readOne(keys[0]);
          if (!stockTaking || payload.status !== 1) return;

          const stockTakingProducts = await stockTakingProductService.readByQuery({
            filter: {
              stock_taking: { _eq: keys[0] }
            }
          });

          for (const product of stockTakingProducts) {
            const stock = await stockService.readByQuery({
              filter: {
                _and: [
                  { warehouse: { _eq: stockTaking.warehouse } },
                  { product: { _eq: product.product } }
                ]
              }
            });

            if (stock.length > 0) {
              await stockService.updateOne(stock[0].id, { onhand_quantity: product.quantity });
            } else {
              await stockService.createOne({
                warehouse: stockTaking.warehouse,
                product: product.product,
                onhand_quantity: product.quantity
              });
            }
          }
        } catch (err) {
          console.error('Error updating stock in stock taking action:', err);
        }
      }
    },

    'stock_transfer.items.update': {
      filter: async (input: any, payload: { keys: string[] }, meta: { accountability: { user: string } }): Promise<any> => {
        input.last_updated_on = new Date();
        input.last_user = meta.accountability.user;
        return input;
      },
      action: async ({ payload, keys }: { payload: { status?: number; input?: any }, keys: string[] }): Promise<void> => {
        try {
          const schema = await getSchema();
          const stockTransferService = new ItemsService("stock_transfer", { schema });
          const stockTransfer = await stockTransferService.readOne(keys[0], { fields: ["*.*"] }) as StockTransfer;
          
          // Handle barcode scanner input
          if (payload.input?.barcode_scanner) {
            const stockService = new ItemsService("stock", { schema });
            const stockTransferProductService = new ItemsService("stock_transfer_products", { schema });
            const scans = payload.input.barcode_scanner;
            
            for (const scan of scans) {
              const receivingStock = await stockService.readByQuery({
                filter: {
                  _and: [
                    { warehouse: stockTransfer.warehouse_receiving },
                    { product: scan.product_id }
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
                product: scan.product_id,
                transfer_quantity: scan.units,
                sending_warehouse_onhand: scan.onhand,
                sending_warehouse_available: scan.available,
                receiving_warehouse_onhand: receivingOnhand,
                receiving_warehouse_available: receivingAvailable,
                receiving_warehouse_ordered: receivingOrdered,
                receiving_warehouse_reserved: receivingReserved,
                stock_transfer: keys[0]
              } as StockTransferProduct);
            }
          }

          // Handle stock transfer products creation
          if (payload.input?.stock_transfer_products?.create?.length > 0) {
            const stockService = new ItemsService("stock", { schema });
            const stockTransferProductService = new ItemsService("stock_transfer_products", { schema });
            const creates = payload.input.stock_transfer_products.create;
            
            for (const create of creates) {
              const sendingStock = await stockService.readByQuery({
                filter: {
                  _and: [
                    { warehouse: stockTransfer.warehouse },
                    { product: create.product }
                  ]
                }
              });
              
              if (sendingStock.length === 0) {
                throw new Error(`Product ${create.product} is not present in sending warehouse stock`);
              }
              
              const sendingOnhand = sendingStock[0].onhand_quantity;
              const sendingAvailable = sendingStock[0].available_quantity;
              
              const receivingStock = await stockService.readByQuery({
                filter: {
                  _and: [
                    { warehouse: stockTransfer.warehouse_receiving },
                    { product: create.product }
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
                receivingReserved = receivingStock[0].reserved_quantity;
                receivingOrdered = receivingStock[0].ordered_quantity;
              }
              
              await stockTransferProductService.createOne({
                product: create.product,
                transfer_quantity: create.transfer_quantity,
                sending_warehouse_onhand: sendingOnhand,
                sending_warehouse_available: sendingAvailable,
                receiving_warehouse_onhand: receivingOnhand,
                receiving_warehouse_available: receivingAvailable,
                receiving_warehouse_ordered: receivingOrdered,
                receiving_warehouse_reserved: receivingReserved,
                stock_transfer: create.stock_transfer
              } as StockTransferProduct);
            }
          }

          // Handle stock updates when status is 1
          if (stockTransfer && stockTransfer.status === 1) {
            const stockService = new ItemsService("stock", { schema });
            const stockTransferProductService = new ItemsService("stock_transfer_products", { schema });
            
            const transferProducts = await stockTransferProductService.readByQuery({
              filter: { stock_transfer: { _eq: keys[0] } }
            });

            for (const transferProduct of transferProducts) {
              // Update sending warehouse stock
              const sendingStock = await stockService.readByQuery({
                filter: {
                  _and: [
                    { warehouse: stockTransfer.warehouse },
                    { product: transferProduct.product }
                  ]
                }
              });
              
              if (sendingStock.length > 0) {
                const newSendingOnhand = sendingStock[0].onhand_quantity - transferProduct.transfer_quantity;
                await stockService.updateOne(sendingStock[0].id, { onhand_quantity: newSendingOnhand });
              }

              // Update receiving warehouse stock
              const receivingStock = await stockService.readByQuery({
                filter: {
                  _and: [
                    { warehouse: stockTransfer.warehouse_receiving },
                    { product: transferProduct.product }
                  ]
                }
              });

              if (receivingStock.length > 0) {
                const newReceivingOnhand = receivingStock[0].onhand_quantity + transferProduct.transfer_quantity;
                await stockService.updateOne(receivingStock[0].id, { onhand_quantity: newReceivingOnhand });
              } else {
                await stockService.createOne({
                  warehouse: stockTransfer.warehouse_receiving,
                  product: transferProduct.product,
                  onhand_quantity: transferProduct.transfer_quantity
                });
              }
            }
          }
        } catch (err) {
          console.error('Error updating stock in transfer action:', err);
        }
      }
    }
  };
};
