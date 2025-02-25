import { Knex } from "knex";


interface ItemsService {
    createOne(data: Record<string, any>): Promise<number>;
}

interface Context {
    services: {
        ItemsService: new (collection: string, options: { schema: any }) => ItemsService;
    };
    getSchema(): Promise<any>;
}

class DataWriter {
    private database: Knex;
    private _context?: Context;

    constructor(database: Knex) {
        this.database = database;
    }

    /**
     * Writes data to a specified collection
     * @param collection - The collection name to write to
     * @param queryJson - The data to write
     * @returns The ID of the created item
     */
    async writeData(collection: string, queryJson: Record<string, any>): Promise<number> {
        if (!this._context) {
            throw new Error('Context not initialized');
        }
        const schema = await this._context.getSchema();
        const { ItemsService } = this._context.services;
        const itemsService = new ItemsService(collection, { schema });
        const itemId = await itemsService.createOne(queryJson);
        return itemId;
    }

    /**
     * Writes stock history data
     */
    async writeStockHistory(): Promise<void> {
        const query = `insert into stock_history (product, warehouse, available_quantity ,onhand_quantity,reserved_quantity,ordered_quantity ,date) 
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
               and sh.available_quantity + srp.quantity > 0 );`;

        await this.database.raw(query);
    }

    /**
     * Creates a new product timestamp
     * @param product - Product ID
     * @param warehouse - Warehouse ID
     * @param timestamp - Timestamp to record
     */
    async createProductTimestamp(product: number | null, warehouse: number, timestamp: Date): Promise<void> {
        if (product != null) {
            const formatDateForMySQL = this.formatDateForMySQL(new Date(timestamp));
            console.log("INSERTING TIMESTAMP\n\n\n");
            console.log(formatDateForMySQL);
            const query = `insert into product_timestamps (product, warehouse, last_timestamp) values ('${product}','${warehouse}','${formatDateForMySQL}')`;
            await this.database.raw(query);
        }
    }

    /**
     * Updates an existing product timestamp
     * @param product - Product ID
     * @param warehouse - Warehouse ID
     * @param timestamp - New timestamp
     */
    async updateProductTimestamp(product: number, warehouse: number, timestamp: Date): Promise<void> {
        const formatDateForMySQL = this.formatDateForMySQL(new Date(timestamp));
        console.log("INSERTING TIMESTAMP\n\n\n");
        console.log(formatDateForMySQL);
        const query = `update product_timestamps set last_timestamp = '${formatDateForMySQL}' where product = '${product}' and warehouse = '${warehouse}'`;
        await this.database.raw(query);
    }

    /**
     * Records the last purchased timestamp for a product
     * @param product - Product ID
     * @param warehouse - Warehouse ID
     */
    async productLastPurchasedTimestamp(product: number, warehouse: number): Promise<void> {
        const query = `select timestamp from product_last_purchased_timestamp where product = '${product}' and warehouse = '${warehouse}'`;
        const result = await this.database.raw(query);
        console.log("RESULT\n\n\n");
        console.log(result);
        if (result[0].length === 0) {
            await this.database.raw(
                `insert into product_last_purchased_timestamp (product, warehouse, timestamp) values ('${product}','${warehouse}',CURRENT_TIMESTAMP())`
            );
        } else {
            await this.database.raw(
                `update product_last_purchased_timestamp set timestamp = CURRENT_TIMESTAMP() where product = '${product}' and warehouse = '${warehouse}'`
            );
        }
    }

    async updateChildProductStatus(productId: number, status: number) {
        const query = `update product set status = '${status}' where parent_product = '${productId}'`;
        await this.database.raw(query);
    }

    /**
     * Formats a date object for MySQL compatibility
     * @param date - Date to format
     * @returns Formatted date string
     */
    private formatDateForMySQL(date: Date): string {
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
