import DataProvider from "../../class/DataProvider";
import DataWriter from "../../class/DataWriter";

/**
 * Interface for the context object that contains services and schema information
 */
interface Context {
  services: {
    ItemsService: any;
  };
  getSchema: () => Promise<any>;
}

/**
 * Interface for order check data structure
 */
interface OrderCheckData {
  order_id: number;
  product_id: number;
  quantity: number;
  available_quantity: number;
  reserved_quantity: number;
}

/**
 * Interface for replenishment data structure
 */
interface ReplenishmentData {
  warehouse: number;
}

/**
 * Class responsible for checking stock availability and updating order statuses
 */
class StockCheck {
  private _context: Context;

  constructor(context: Context) {
    this._context = context;
  }

  /**
   * Checks if replenished products are sufficient for orders with "missing product" status in the warehouse
   * @param warehouseId - ID of the warehouse to check
   */
  async afterReplenishmentCheck(warehouseId: number): Promise<void> {
    const dataProvider = new DataProvider(this._context);
    const ordersToCheck = await dataProvider.getOrderCheckData(warehouseId);
    await this.productSufficiencyCheck(ordersToCheck);
  }

  // /**
  //  * Checks if transferred products are sufficient for orders with "missing product" status in the destination warehouse
  //  * @param transferId - ID of the transfer to check
  //  */
  // async afterTransferCheck(transferId: number): Promise<void> {
  //   const dataProvider = new DataProvider(this._context);
  //   const dataWriter = new DataWriter(this._context);
  //   const replenishmentData: ReplenishmentData = await dataProvider.getReplenishment(transferId);
  //   const warehouse = replenishmentData.warehouse;
  //   const ordersToCheck = await dataProvider.getOrdersForStockCheck(
  //     warehouse,
  //     transferId,
  //     "transfer"
  //   );
  //   await this.productSufficiencyCheck(ordersToCheck, warehouse);
  // }

  /**
   * Checks if products are sufficient for orders with "missing product" status in the warehouse
   * @param orderData - Array of order data to check
   * @param warehouse - Optional warehouse ID
   */
  async productSufficiencyCheck(orderData: OrderCheckData[], warehouse?: number): Promise<void> {
    const { ItemsService } = this._context.services;
    const productMap = new Map<number, number>();
    const schema = await this._context.getSchema();
    const orderService = new ItemsService("orders", { schema: schema });

    let order: number | null = orderData.length > 0 ? orderData[0].order_id : null;
    let stockIsSufficient = true;
    console.log(order);

    for (let i = 0; i < orderData.length; i++) {
      if (orderData[i].order_id != order) {
        if (stockIsSufficient) {
          await orderService.updateOne(order!, { order_status: 4 });
        }
        order = orderData[i].order_id;
        stockIsSufficient = true;
      }

      const productId = orderData[i].product_id;
      let totalAvailable = productMap.get(productId);

      if (totalAvailable === undefined) {
        totalAvailable = orderData[i].available_quantity + orderData[i].reserved_quantity;
      }

      if (orderData[i].quantity > totalAvailable + orderData[i].quantity) {
        stockIsSufficient = false;
      }

      productMap.set(productId, totalAvailable - orderData[i].quantity);
    }

    console.log("stockIsSufficient :" + stockIsSufficient);
    if (stockIsSufficient && order != null) {
      console.log(order);
      await orderService.updateOne(Number(order), { order_status: 4 });
    }
  }
}

export default StockCheck;
