import mysql from 'mysql';
import Constants from '../const/Constants';
import Product from '../class/Product';
import ExternalDataProvider from '../class/ExternalDataProvider';
class StockTransferSync {
    constructor(context) {
        this._context = context;
        this._getSchema = this._context.getSchema;
    }

   


    async syncWarehouseTransfers() {
        let con;
		
			con =  mysql.createConnection({
				host: Constants.psHost,
				port: Constants.psPort,
				user: Constants.psUser,
				password: Constants.psPassword,
				database: Constants.psDatabase
			});
    
        let {ItemsService} = this._context.services;
        let schema = await this._getSchema();
        let stockTransferService = new ItemsService("stock_transfer", {schema: schema});
        let stockTransferProductsService = new ItemsService("stock_transfer_products", {schema: schema});
        let warehouseService = new ItemsService("warehouse", {schema: schema});
        let stockService = new ItemsService("stock", {schema: schema});
        let transferLogService = new ItemsService("transfer_log", {schema: schema});

    //Somewhere ItemService is not a constructor, need to check
        try {
            // Fetch the latest transfer from Directus
            let latestTransfer = [];
            latestTransfer = await stockTransferService.readByQuery({
                sort: ['-id'],
                limit: 1
            });
   
            if(latestTransfer.length == 0){
                let json = {date_add :  '2024-09-10'}
                latestTransfer.push(json)
                
            }
            let lastSyncDate = latestTransfer[0].date_add ;
     
            // Fetch new transfers from PrestaShop
            let newTransfers = await new Promise((resolve, reject) => {
                con.query(`
                    SELECT wt.* from cos_warehouse_transfer wt
                    WHERE wt.date_add > ?
                    ORDER BY wt.date_add ASC
                `, [lastSyncDate], (error, results) => {
                    if (error) reject(error);
                    else resolve(results);
                });
            });

            for (let transfer of newTransfers) {
      
            }
            // Updated status mapping
            let statusMap = {
                1: 2, // draft
                2: 4, // shipped (assuming 'in_transit' in PrestaShop means 'shipped' in Directus)
                3: 5, // received
                4: 7  // cancelled
            };

            let warehouseMap = {
               5: 1,
               6: 2,
               7: 3,
            }
    
            for (let transfer of newTransfers) {
          
             
       
              
                // Create new transfer
         
            
                let newDirectusTransfer = await stockTransferService.createOne({
                   // barcode_scanner: transfer.code,
                   // status: statusMap[transfer.id_warehouse_transfer_state] || 0, // Default to draft if status is unknown
                    warehouse: warehouseMap[transfer.id_warehouse_from],
                    warehouse_receiving: warehouseMap[transfer.id_warehouse_to],
                    transfer_status: statusMap[transfer.id_warehouse_transfer_state] || 0, // Default to draft if status is unknown
                    last_updated_on: transfer.date_upd,
                    date_add: transfer.date_add
                    
                });
          
                // Fetch and create transfer products
                let transferProducts = await new Promise((resolve, reject) => {
                    con.query(`
                        SELECT * FROM cos_warehouse_transfer_detail
                        WHERE id_warehouse_transfer = ?
                    `, [transfer.id_warehouse_transfer], (error, results) => {
                        if (error) reject(error);
                        else resolve(results);
                    });
                });
             
                for (let product of transferProducts) {
                
                    let directusProduct = await this.mapPrestaShopProductToDirectus(product.id_product,product.id_product_attribute);
                 
         
                    await stockTransferProductsService.createOne({
                        stock_transfer:Number(newDirectusTransfer),
                        product: directusProduct,
                        transfer_quantity: product.quantity
                    });
                }
    
            
            }
            con.end();
            console.log("Warehouse transfer sync completed");
            await transferLogService.createOne({message: "Warehouse transfer sync completed successfully"});
        } catch (error) {
            await transferLogService.createOne({message: error.message});
            throw error;
        }
    }


// You'll need to implement this function to map PrestaShop product IDs to Directus product IDs
async mapPrestaShopProductToDirectus(prestaShopProductId,prestaShopProductAttributeId) {
    let {ItemsService} = this._context.services;
    let schema = await this._getSchema();
    let productHelper = new Product(ItemsService,schema);
    
    let salesChannelProductService = new ItemsService("sales_channel_products", {schema: schema});
    let fullProductId = "" ;

   if(prestaShopProductAttributeId != 0){
    fullProductId = prestaShopProductId + "_" + prestaShopProductAttributeId;
   }
   else{
    fullProductId = prestaShopProductId;
   }
    
    let salesChannelProduct = await salesChannelProductService.readByQuery({filter: {sales_channel_product_id: fullProductId}});

   if(salesChannelProduct.length > 0){
    return salesChannelProduct[0].product;
   }
   else{

    let externalDataProvider = new ExternalDataProvider(Constants.psHost, Constants.psPort, Constants.psPassword, Constants.psUser,  Constants.psDatabase);
    let productDataResponse =[]
    productDataResponse = await externalDataProvider.getPrestashopProduct(prestaShopProductId,prestaShopProductAttributeId);
    let productData = productDataResponse[0];
    if(productData.hasOwnProperty('sku')){
   
        let product = await productHelper.getProductBySku(productData);
        
        return product.product_id;
    }
    else{
        let product = await productHelper.getProductBySku(productData)
    return product.product_id;
    }

}
   }
    



}
export default StockTransferSync;