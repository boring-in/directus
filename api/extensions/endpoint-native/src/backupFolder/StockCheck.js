import DataProvider from "../../class/DataProvider";
import DataWriter from "../../class/DataWriter";
class StockCheck {
  constructor(context) {
    this._context = context;
  }

  // checks if replenished products are sufficient for orders with "missing product" status in the warehouse
  async afterReplenishmentCheck(warehouseId) {
    let dataProvider = new DataProvider(this._context);
    let ordersToCheck = await dataProvider.getOrderCheckData(warehouseId);
    await this.productSufficiencyCheck(ordersToCheck);
  }

  // checks if transfered products are sufficient for orders with "missing product" status in the destination warehouse
  async afterTransferCheck(transferId) {
    let dataProvider = new DataProvider(this._context);
    let dataWriter = new DataWriter(this._context);
    let replenishmentData = await dataProvider.getReplenishment(transferId);
    let warehouse = replenishmentData.warehouse;
    let ordersToCheck = await dataProvider.getOrdersForStockCheck(
      warehouse,
      transferId,
      "transfer"
    );
    await this.productSufficiencyCheck(ordersToCheck, warehouse);
  }

  // checks if products are sufficient for orders with "missing product" status in the warehouse
  async productSufficiencyCheck(orderData, warehouse) {

    const { ItemsService } = this._context.services;
    let dataProvider = new DataProvider(this._context);
    let productMap = new Map();
    let schema = await this._context.getSchema();
    let orderService = new ItemsService("orders", { schema: schema });

    let order = orderData.length > 0 ?  orderData[0].order_id : null;
    let stockIsSufficient = true;
    console.log(order)
    for (let i = 0; i < orderData.length; i++) {
       
        if(orderData[i].order_id != order){
            if (stockIsSufficient) {
               
                await orderService.updateOne(order, { order_status: 4 });
              }
            order = orderData[i].order_id;
            
            stockIsSufficient = true;
          }
          let productId = orderData[i].product_id;
      
               let totalAvailable = productMap.get(productId);
                
                if (totalAvailable=== undefined) {
                   totalAvailable = orderData[i].available_quantity+orderData[i].reserved_quantity;
                }
                if(orderData[i].quantity > totalAvailable + orderData[i].quantity ){
                    stockIsSufficient = false;
                }
                productMap.set(productId, totalAvailable - orderData[i].quantity);

     
        }
        console.log("stockIsSufficient :"+stockIsSufficient);
        if (stockIsSufficient && order != null) {
            console.log(order)
            await orderService.updateOne(Number(order), { order_status: 4 });
          }
      
  }
}
export default StockCheck;
