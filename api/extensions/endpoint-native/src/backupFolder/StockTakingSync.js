import mysql from 'mysql';
import Constants from '../const/Constants';
import Product from '../class/Product';
import ExternalDataProvider from '../class/ExternalDataProvider';
class StockTakingSync {
    constructor(context) {
        this._context = context;
        this._getSchema = this._context.getSchema;
    }

    async sync() {
        //get latest stock taking from directus
        let {ItemsService} = this._context.services;
        let schema = await this._getSchema();
        let stockTakingService = new ItemsService("stock_taking", {schema: schema});
        let stockTakingProductsService = new ItemsService("stock_taking_product", {schema: schema});
        let salesChannelProductService = new ItemsService("sales_channel_products", {schema: schema});
        let stockService = new ItemsService("stock", {schema: schema});
        let stockTakings = [];
        stockTakings = await stockTakingService.readByQuery({filter: {is_imported: {_eq:true}},
            sort: ['-id'],
            limit: 1
        });
        if(stockTakings.length == 0){
            let json = {date_add :  this.getCurrentFormattedDate()}
            stockTakings.push(json)
        }
        // Fetch new stock takings from PrestaShop
        let externalDataProvider = new ExternalDataProvider(Constants.psHost, Constants.psPort,  Constants.psPassword, Constants.psUser, Constants.psDatabase);
        let newStockTakings = await externalDataProvider.getStockTakings(stockTakings[0].date_add);
        for (let i = 0; i < newStockTakings.length; i++) {
           // console.log("newStockTakings[i]: ");
           // console.log(newStockTakings[i]);
            let localWarehouseId = Constants.getPsWarehouseId(newStockTakings[i].id_warehouse);
            let stockTaking = await stockTakingService.createOne({is_imported:true,warehouse:localWarehouseId, read_only_flag:true,date_add:newStockTakings[i].date_add});
            let currentStock = await externalDataProvider.getCurrentStock(newStockTakings[i].id_warehouse, newStockTakings[i].id_product, newStockTakings[i].id_product_attribute);
            console.log("currentStock: ");
            console.log(currentStock);
            //find local product 
            let externalId = newStockTakings[i].id_product + "_" + newStockTakings[i].id_product_attribute;
            let localProduct = await salesChannelProductService.readByQuery({filter: {sales_channel_product_id: {_eq:externalId}}});
            if(localProduct.length == 0){
                continue;
            }
            await stockTakingProductsService.createOne({stock_taking:stockTaking,product:localProduct[0].product, quantity:newStockTakings[i].quantity, is_imported:true});
            let stock = await stockService.readByQuery({filter: {warehouse: {_eq:localWarehouseId}, product: {_eq:localProduct[0].product}}});
            if(stock.length == 0){
                await stockService.createOne({warehouse:localWarehouseId, product:localProduct[0].product, onhand_quantity:currentStock});
            }
            else{
                await stockService.updateOne(stock[0].id, {onhand_quantity:currentStock});
            }

        }
        externalDataProvider.endConnection();

    }

     getCurrentFormattedDate() {
        const date = new Date();
    
        // Get individual date components
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
        const day = String(date.getDate()).padStart(2, '0');
        
        // Get individual time components
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
    
        // Construct formatted date
        return `${year}-${month}-${day} 01:00:00.0`;
    }
}
export default StockTakingSync;
