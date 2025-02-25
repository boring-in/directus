class DataWriter {
    constructor(database) {
        this.database = database;
    }
    async writeData(collection, queryJson) {
        let schema = await this._context.getSchema();
        let { ItemsService } = this._context.services;
        let itemsService = new ItemsService(collection, { schema });
        let itemId = await itemsService.createOne(queryJson);
        return itemId;
    }

    async writeStockHistory(){
      
        let query =
        `insert into stock_history (product, warehouse, available_quantity ,onhand_quantity,reserved_quantity,ordered_quantity ,date) 
        select
           s.product ,
           s.warehouse ,
           s.available_quantity ,
           s.onhand_quantity ,
           s.reserved_quantity,
           s.ordered_quantity,
           CURDATE() as date 
       from
           stock s
       left join stock_history sh on
           s.product = sh.product
           and s.warehouse = sh.warehouse
           and sh.date = CURDATE() - INTERVAL 1 DAY
       left join (
           select
               srp.product,
               sr.warehouse,
               sum(srp.quantity) as quantity
           from
               stock_replenishment sr
           inner join stock_replenishment_products srp
          on
               sr.id = srp.stock_replenishment
               where DATE_FORMAT(sr.date_add, "%Y-%m-%d")= CURDATE() - INTERVAL 1 DAY
           group by
               srp.product,
               sr.warehouse
          ) as srp on
           srp.warehouse = s.warehouse
           and srp.product = s.product
       where
           (s.available_quantity > 0 )
           or ( sh.available_quantity > 0 )
           or (srp.product is not null
               and sh.available_quantity + srp.quantity > 0 );

   `
   await this.database.raw(query);
    }

    async createProductTimestamp(product,warehouse,timestamp){
        if(product!=null){
        let formatDateForMySQL = this.formatDateForMySQL(new Date(timestamp));
        console.log("INSERTING TIMESTAMP\n\n\n")
        console.log(formatDateForMySQL)
        let query = `insert into product_timestamps (product, warehouse, last_timestamp) values ('${product}','${warehouse}','${formatDateForMySQL}')`;
        await this.database.raw(query);
        }
    }

    async updateProductTimestamp(product,warehouse,timestamp){
        let formatDateForMySQL = this.formatDateForMySQL(new Date(timestamp));
        console.log("INSERTING TIMESTAMP\n\n\n")
        console.log(formatDateForMySQL)
        let query = `update product_timestamps set last_timestamp = '${formatDateForMySQL}' where product = '${product}' and warehouse = '${warehouse}'`;
        await this.database.raw(query);
    }

    async productLastPurchasedTimestamp(product,warehouse){
 
        let query = `select timestamp from product_last_purchased_timestamp where product = '${product}' and warehouse = '${warehouse}'`;
        let result = await this.database.raw(query);
        console.log("RESULT\n\n\n")
        console.log(result)
        if( result[0].length == 0 ){
            await this.database.raw(`insert into product_last_purchased_timestamp (product, warehouse, timestamp) values ('${product}','${warehouse}',CURRENT_TIMESTAMP())`);
        }
        else{
            await this.database.raw(`update product_last_purchased_timestamp set timestamp = CURRENT_TIMESTAMP() where product = '${product}' and warehouse = '${warehouse}'`);
        }
    }

     formatDateForMySQL(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
    
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

}
export default DataWriter;